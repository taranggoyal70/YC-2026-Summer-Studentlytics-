import { SignIn, SignUp } from '@clerk/react'
import { Link } from 'react-router-dom'
import { ScanFace } from 'lucide-react'

interface ClerkAuthPageProps {
  mode?: 'sign-in' | 'sign-up'
}

export default function ClerkAuthPage({ mode = 'sign-in' }: ClerkAuthPageProps) {
  const isSignUp = mode === 'sign-up'

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ScanFace className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold">Studentlytics</p>
              <p className="text-xs text-muted-foreground">Secure presence intelligence</p>
            </div>
          </Link>

          <div className="mb-6">
            <h1 className="text-3xl font-bold">{isSignUp ? 'Create your account' : 'Sign in securely'}</h1>
            <p className="text-muted-foreground mt-2">
              Authentication is handled by Clerk. Studentlytics never stores your password.
            </p>
          </div>

          {isSignUp ? (
            <SignUp forceRedirectUrl="/" signInUrl="/login" />
          ) : (
            <SignIn forceRedirectUrl="/" signUpUrl="/signup" />
          )}
        </div>
      </div>

      <div className="hidden lg:flex items-center justify-center bg-slate-950 text-white p-12">
        <div className="max-w-lg">
          <p className="text-sm font-semibold text-blue-300 mb-4">Security-first by default</p>
          <h2 className="text-4xl font-bold mb-6">Protected sessions, strict roles, private data.</h2>
          <div className="space-y-4 text-slate-300">
            <p>Managed sessions and MFA-ready authentication through Clerk.</p>
            <p>Role checks are enforced before staff-only dashboards render.</p>
            <p>Backend API calls carry short-lived session tokens for ownership checks.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
