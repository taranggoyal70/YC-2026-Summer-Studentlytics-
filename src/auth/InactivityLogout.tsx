import { useAuth, useClerk } from '@clerk/react'
import { useEffect } from 'react'

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000

export default function InactivityLogout() {
  const { isSignedIn } = useAuth()
  const { signOut } = useClerk()

  useEffect(() => {
    if (!isSignedIn) return

    let timeoutId = window.setTimeout(() => {
      void signOut({ redirectUrl: '/login?reason=inactive' })
    }, INACTIVITY_LIMIT_MS)

    const resetTimer = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        void signOut({ redirectUrl: '/login?reason=inactive' })
      }, INACTIVITY_LIMIT_MS)
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }))

    return () => {
      window.clearTimeout(timeoutId)
      events.forEach((event) => window.removeEventListener(event, resetTimer))
    }
  }, [isSignedIn, signOut])

  return null
}
