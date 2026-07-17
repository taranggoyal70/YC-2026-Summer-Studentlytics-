import { useAuth, useUser } from '@clerk/react'
import { useEffect, useRef } from 'react'
import { setAuthTokenProvider, markAuthReady, getAuthHeaders } from '../services/authToken'
import { getApiEndpoint } from '../config/api'

export default function ClerkTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      // The 'studentlytics' JWT template embeds public_metadata.role so the
      // backend can authorize teacher/admin actions from the token alone.
      setAuthTokenProvider(() => getToken({ template: 'studentlytics', skipCache: true }))
    } else {
      setAuthTokenProvider(null)
      bootstrapped.current = false
    }
    markAuthReady()
    return () => setAuthTokenProvider(null)
  }, [getToken, isLoaded, isSignedIn])

  // First-touch bootstrap: /api/me promotes the signup-requested role into
  // public_metadata; reloading the Clerk user picks it up for route guards.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || bootstrapped.current) return
    bootstrapped.current = true
    ;(async () => {
      try {
        const headers = await getAuthHeaders()
        await fetch(`${getApiEndpoint()}/me`, { headers })
        await user.reload()
      } catch {
        // Non-fatal: role promotion retries on next page load.
        bootstrapped.current = false
      }
    })()
  }, [isLoaded, isSignedIn, user])

  return null
}
