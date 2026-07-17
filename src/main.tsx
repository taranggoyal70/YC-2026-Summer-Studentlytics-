import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/react'
import App from './App.tsx'
import './index.css'
import { SemesterProvider } from './contexts/SemesterContext'
import ClerkTokenBridge from './auth/ClerkTokenBridge'
import InactivityLogout from './auth/InactivityLogout'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const root = ReactDOM.createRoot(document.getElementById('root')!)

if (!clerkPublishableKey) {
  root.render(
    <React.StrictMode>
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950 mb-2">Authentication is not configured</h1>
          <p className="text-sm text-slate-600">
            Set VITE_CLERK_PUBLISHABLE_KEY before launching this environment.
          </p>
        </div>
      </div>
    </React.StrictMode>,
  )
} else {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <BrowserRouter>
          <ClerkTokenBridge />
          <InactivityLogout />
          <SemesterProvider>
            <App />
          </SemesterProvider>
        </BrowserRouter>
      </ClerkProvider>
    </React.StrictMode>,
  )
}
