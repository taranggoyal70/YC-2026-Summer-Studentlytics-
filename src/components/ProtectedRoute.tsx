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
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
