import { useState } from 'react'
import { useClerk, useUser } from '@clerk/react'
import { motion } from 'framer-motion'
import { Download, Mail, Shield, Trash2, UserRound } from 'lucide-react'
import { Button } from '../components/ui/button'
import { getClerkRole, getDisplayName } from '../auth/clerk'
import { deleteMyAccountData, exportMyData } from '../services/accountService'

export default function ProfilePage() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<'export' | 'delete' | null>(null)

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  const role = getClerkRole(user)
  const displayName = getDisplayName(user)
  const email = user?.primaryEmailAddress?.emailAddress ?? 'Private'
  const joinedAt = user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Recently'

  const handleExport = async () => {
    try {
      setWorking('export')
      setError(null)
      setStatus(null)
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'studentlytics-personal-data.json'
      link.click()
      URL.revokeObjectURL(url)
      setStatus('Your personal data export is ready.')
    } catch {
      setError('We could not export your data right now.')
    } finally {
      setWorking(null)
    }
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      'Delete your Studentlytics account data? This removes your owned rosters, opportunities, processing jobs, and face enrollment data.'
    )
    if (!confirmed) return

    try {
      setWorking('delete')
      setError(null)
      setStatus(null)
      await deleteMyAccountData()
      await signOut({ redirectUrl: '/login' })
    } catch {
      setError('We could not delete your account data right now.')
      setWorking(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-28 h-28 rounded-full bg-slate-900 flex items-center justify-center text-white shadow-sm overflow-hidden">
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-12 w-12" />
                )}
              </div>

              <div className="flex-1 text-center md:text-left">
                <h1 className="text-3xl font-bold text-slate-950 mb-2">{displayName}</h1>
                <div className="flex flex-col md:flex-row gap-4 text-slate-600 mb-4">
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">{email}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm">Joined {joinedAt}</span>
                  </div>
                </div>
                <span className="inline-flex rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-700 capitalize">
                  {role}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8">
            <h2 className="text-2xl font-bold text-slate-950 mb-2">Privacy Controls</h2>
            <p className="text-sm text-slate-600 mb-6">
              Manage the personal data tied to your signed-in Studentlytics account.
            </p>

            {status && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {status}
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-900 mb-2">Export My Data</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Download your owned rosters, opportunities, and processing records as JSON.
                </p>
                <Button onClick={handleExport} disabled={working !== null} className="w-full gap-2">
                  <Download className="h-4 w-4" />
                  {working === 'export' ? 'Preparing...' : 'Download Data'}
                </Button>
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50 p-5">
                <h3 className="font-semibold text-red-950 mb-2">Delete My Account Data</h3>
                <p className="text-sm text-red-800 mb-4">
                  Permanently remove the Studentlytics data owned by this account.
                </p>
                <Button onClick={handleDelete} disabled={working !== null} variant="destructive" className="w-full gap-2">
                  <Trash2 className="h-4 w-4" />
                  {working === 'delete' ? 'Deleting...' : 'Delete Account Data'}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
