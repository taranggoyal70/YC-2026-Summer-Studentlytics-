import { motion } from 'framer-motion'
import { CalendarClock, FileVideo, Link2, Radio, ShieldCheck, Upload, Users, Video } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'

const integrations = [
  {
    title: 'Zoom recording import',
    status: 'Ready for upload',
    description: 'Upload exported Zoom recordings and transcripts to generate attendance, check-in/out, and engagement timelines.',
    icon: Video,
    action: 'Upload recording',
  },
  {
    title: 'Google Meet recording import',
    status: 'Ready for upload',
    description: 'Process Meet recordings from Drive exports for classrooms, company training, webinars, and events.',
    icon: FileVideo,
    action: 'Connect recording',
  },
  {
    title: 'Live room adapter',
    status: 'Roadmap',
    description: 'Join live sessions as a passive observer to timestamp arrivals, exits, re-entries, and focus signals in real time.',
    icon: Radio,
    action: 'View roadmap',
  },
  {
    title: 'Roster and face enrollment',
    status: 'Active',
    description: 'Maintain participant profiles, consent status, reference photos, and role-based access for each organization.',
    icon: Users,
    action: 'Manage people',
  },
  {
    title: 'Calendar scheduling',
    status: 'Active',
    description: 'Keep session dates, expected attendees, room type, and organizer ownership aligned before analysis starts.',
    icon: CalendarClock,
    action: 'Review sessions',
  },
  {
    title: 'Secure API and exports',
    status: 'Protected',
    description: 'Export attendance reports and prepare API handoff points for LMS, HR, event platforms, and compliance teams.',
    icon: ShieldCheck,
    action: 'Export data',
  },
]

export default function IntegrationsPage() {
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
              Bring in recordings, rosters, calendars, and session metadata so Studentlytics can produce usable attendance and engagement evidence.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10">
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
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {integration.status}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{integration.title}</CardTitle>
                  <CardDescription>{integration.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full justify-start">
                    {integration.action === 'Upload recording' ? <Upload className="mr-2 h-4 w-4" /> : <Link2 className="mr-2 h-4 w-4" />}
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
