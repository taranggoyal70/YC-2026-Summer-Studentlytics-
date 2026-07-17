import { useAuth } from '@clerk/react'
import { useEffect } from 'react'
import { setAuthTokenProvider, markAuthReady } from '../services/authToken'

export default function ClerkTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      // The 'studentlytics' JWT template embeds public_metadata.role so the
      // backend can authorize teacher/admin actions from the token alone.
      setAuthTokenProvider(() => getToken({ template: 'studentlytics', skipCache: true }))
    } else {
      setAuthTokenProvider(null)
    }
    markAuthReady()
    return () => setAuthTokenProvider(null)
  }, [getToken, isLoaded, isSignedIn])

  return null
}
