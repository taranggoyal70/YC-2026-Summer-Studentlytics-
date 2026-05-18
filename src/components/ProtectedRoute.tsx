import { Navigate } from 'react-router-dom'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: ('student' | 'teacher' | 'admin')[]
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  // Get user role immediately from localStorage
  const userData = localStorage.getItem('user')
  let userRole: string | null = null
  
  if (userData) {
    try {
      const user = JSON.parse(userData)
      userRole = user.type || 'student'
    } catch (e) {
      console.error('Failed to parse user data:', e)
    }
  }

  // If no role or role not allowed, redirect immediately
  if (!userRole || !allowedRoles.includes(userRole as any)) {
    console.log(`Access denied: User role "${userRole}" not in allowed roles:`, allowedRoles)
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
