// Blob client-upload token endpoint (Node runtime).
// Videos exceed the 4.5 MB function body limit, so the browser uploads
// directly to Vercel Blob; this endpoint only authenticates the request
// (Clerk JWT carried in clientPayload) and issues a scoped upload token.
import { handleUpload } from '@vercel/blob/client'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const issuer = process.env.CLERK_ISSUER
const jwks = createRemoteJWKSet(
  new URL(process.env.CLERK_JWKS_URL || `${issuer?.replace(/\/$/, '')}/.well-known/jwks.json`),
)

const STAFF_ROLES = new Set(['teacher', 'admin'])

async function requireStaff(token) {
  if (!token) throw new Error('Authentication required')
  const { payload } = await jwtVerify(token, jwks, issuer ? { issuer } : {})
  const role = payload.role || payload.public_metadata?.role || payload.metadata?.role || 'student'
  if (!STAFF_ROLES.has(role)) throw new Error('Forbidden')
  return payload.sub
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ detail: 'Method not allowed' })
    return
  }
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const userId = await requireStaff(clientPayload)
        const isVideo = pathname.startsWith('recordings/')
        return {
          allowedContentTypes: isVideo
            ? ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/avi']
            : ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: isVideo ? 2 * 1024 * 1024 * 1024 : 8 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId }),
        }
      },
      // Registration happens explicitly from the client via /api/videos/register,
      // so completion is just acknowledged here.
      onUploadCompleted: async () => {},
    })
    res.status(200).json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload token error'
    const status = message === 'Forbidden' ? 403 : message === 'Authentication required' ? 401 : 400
    res.status(status).json({ detail: message })
  }
}
