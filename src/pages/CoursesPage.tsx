import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarClock, FileVideo, Link2, Loader2, Radio, ShieldCheck, Upload, Users, Video } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { requireApiEndpoint } from '../config/api'
import { getAuthHeaders } from '../services/authToken'

export default function IntegrationsPage() {
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportData = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const response = await fetch(`${requireApiEndpoint()}/me/export`, {
        headers: await getAuthHeaders(),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }))
        throw new Error(err.detail ?? 'Export failed — are you signed in as an organizer?')
      }
      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `studentlytics-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const integrations = [
    {
      title: 'Zoom recording import',
      status: 'Active',
      description: 'Upload exported Zoom recordings to generate attendance, check-in/out, and engagement timelines.',
      icon: Video,
      action: 'Upload Zoom recording',
      actionIcon: Upload,
      onClick: () => navigate('/sessions?upload=1&source=zoom'),
    },
    {
      title: 'Google Meet recording import',
      status: 'Active',
      description: 'Process Meet recordings from Drive exports for classrooms, company training, webinars, and events.',
      icon: FileVideo,
      action: 'Upload Meet recording',
      actionIcon: Upload,
      onClick: () => navigate('/sessions?upload=1&source=meet'),
    },
    {
      title: 'Roster and face enrollment',
      status: 'Active',
      description: 'Maintain participant profiles, enrollment photos, and role-based access for your organization.',
      icon: Users,
      action: 'Manage participants',
      actionIcon: Link2,
      onClick: () => navigate('/students'),
    },
    {
      title: 'Session scheduling',
      status: 'Active',
      description: 'Keep session dates, expected attendees, room type, and organizer ownership aligned before analysis starts.',
      icon: CalendarClock,
      action: 'Review sessions',
      actionIcon: Link2,
      onClick: () => navigate('/sessions'),
    },
    {
      title: 'Data export',
      status: 'Active',
      description: 'Download your organization’s participants and opportunities as JSON for LMS, HR, or compliance handoff.',
      icon: ShieldCheck,
      action: exporting ? 'Exporting…' : 'Export data (JSON)',
      actionIcon: exporting ? Loader2 : ShieldCheck,
      onClick: exportData,
      busy: exporting,
    },
    {
      title: 'Live room adapter',
      status: 'Planned',
      description: 'Live Zoom, Meet, and room-camera monitoring is on the roadmap. Recordings-first analysis ships today (ADR-0001); no live adapter is connected yet.',
      icon: Radio,
      action: 'Not yet available',
      actionIcon: Radio,
      onClick: undefined,
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <section className="border-b bg-slate-950 text-white">
        <div className="container mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="max-w-3xl"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-300/10 px-3 py-1 text-sm font-medium text-blue-100">
              <Link2 className="h-4 w-4" />
              Product connections
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-4">Integrations and data intake</h1>
            <p className="text-lg text-slate-300">
              Bring in recordings, rosters, and session metadata so Studentlytics can produce usable attendance and engagement evidence.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
        {exportError && <p className="mb-6 text-sm text-destructive">{exportError}</p>}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {integrations.map((integration, index) => (
            <motion.div
              key={integration.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
            >
              <Card className="h-full border-slate-200">
                <CardHeader>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                      <integration.icon className="h-5 w-5" />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      integration.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {integration.status}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{integration.title}</CardTitle>
                  <CardDescription>{integration.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    disabled={!integration.onClick || integration.busy}
                    onClick={integration.onClick}
                  >
                    <integration.actionIcon className={`mr-2 h-4 w-4 ${integration.busy ? 'animate-spin' : ''}`} />
                    {integration.action}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}
