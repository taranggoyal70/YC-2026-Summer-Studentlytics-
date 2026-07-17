export type AppRole = 'student' | 'teacher' | 'admin'

const allowedRoles: AppRole[] = ['student', 'teacher', 'admin']

type ClerkUser = {
  publicMetadata?: Record<string, unknown>
  fullName?: string | null
  primaryEmailAddress?: { emailAddress?: string | null } | null
}

export function getClerkRole(user: ClerkUser | null | undefined): AppRole {
  const metadataRole = user?.publicMetadata?.role
  return allowedRoles.includes(metadataRole as AppRole) ? metadataRole as AppRole : 'student'
}

export function getDisplayName(user: ClerkUser | null | undefined): string {
  if (!user) return ''
  return user.fullName || user.primaryEmailAddress?.emailAddress || 'Account'
}
