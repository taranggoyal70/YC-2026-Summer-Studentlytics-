export type AppRole = 'student' | 'teacher' | 'admin'

const allowedRoles: AppRole[] = ['student', 'teacher', 'admin']

type ClerkUser = {
  publicMetadata?: Record<string, unknown>
  unsafeMetadata?: Record<string, unknown>
  fullName?: string | null
  primaryEmailAddress?: { emailAddress?: string | null } | null
}

export function getClerkRole(user: ClerkUser | null | undefined): AppRole {
  const metadataRole = user?.publicMetadata?.role
  if (allowedRoles.includes(metadataRole as AppRole)) return metadataRole as AppRole
  // Fallback while the server-side promotion of the signup-requested role is
  // in flight. Display-level only — the backend authorizes from the token.
  const requestedRole = user?.unsafeMetadata?.role
  if (requestedRole === 'teacher' || requestedRole === 'student') return requestedRole
  return 'student'
}

export function getDisplayName(user: ClerkUser | null | undefined): string {
  if (!user) return ''
  return user.fullName || user.primaryEmailAddress?.emailAddress || 'Account'
}
