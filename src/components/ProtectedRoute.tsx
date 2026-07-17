import { Navigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/react'
import { getClerkRole, type AppRole } from '../auth/clerk'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: AppRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading secure session...</div>
  }

  if (!isSignedIn) {
    return <Navigate to="/login" replace />
  }

  const userRole = getClerkRole(user)
  if (!allowedRoles.includes(userRole)) {
    // Explain the decision instead of silently bouncing home.
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center">
          <h1 className="text-xl font-bold mb-2">Organizer access required</h1>
          <p className="text-sm text-muted-foreground">
            This page needs a {allowedRoles.join(' or ')} role — your account is signed in as {userRole}.
            If you just signed up as an organizer, refresh this page in a few seconds while your role finishes
            activating.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
