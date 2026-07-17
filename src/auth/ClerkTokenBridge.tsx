import { useAuth } from '@clerk/react'
import { useEffect } from 'react'
import { setAuthTokenProvider } from '../services/authToken'

export default function ClerkTokenBridge() {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAuthTokenProvider(null)
      return
    }

    setAuthTokenProvider(() => getToken({ skipCache: true }))
    return () => setAuthTokenProvider(null)
  }, [getToken, isLoaded, isSignedIn])

  return null
}
