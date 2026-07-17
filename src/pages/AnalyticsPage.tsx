import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Users, Calendar, Award, Download, BarChart3, PieChart, Activity, X, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SemesterSelector } from '@/components/SemesterSelector'
import { useSemester } from '@/contexts/SemesterContext'
import { getStatsBySemester } from '@/data/semesterData'
import { realStudents } from '@/data/transformStudents'
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// Generate session participant samples from real data
const sessionParticipants = {
  'Biology 201 lecture recording': {
    enrolled: realStudents.slice(0, 9).map(s => ({
      id: s.id,
      name: s.name,
      status: s.attendanceRate > 75 ? 'completed' : 'in-progress'
    })),
  },
  'Company onboarding webinar': {
    enrolled: realStudents.slice(9, 19).map(s => ({
      id: s.id,
      name: s.name,
      status: s.attendanceRate > 75 ? 'completed' : 'in-progress'
    })),
  },
  'Admissions open house': {
    enrolled: realStudents.slice(19, 27).map(s => ({
      id: s.id,
      name: s.name,
      status: s.attendanceRate > 75 ? 'completed' : 'in-progress'
    })),
  },
  'Executive training session': {
    enrolled: realStudents.slice(27, 35).map(s => ({
      id: s.id,
      name: s.name,
      status: s.attendanceRate > 75 ? 'completed' : 'in-progress'
    })),
  },
  'Conference breakout room': {
    enrolled: realStudents.slice(35, 44).map(s => ({
      id: s.id,
      name: s.name,
      status: s.attendanceRate > 75 ? 'completed' : 'in-progress'
    })),
  },
}

export default function AnalyticsPage() {
  const { selectedSemester } = useSemester()
  const [modalOpen, setModalOpen] = useState(false)
  const [modalData, setModalData] = useState<{
    sessionName: string
    type: 'enrolled' | 'completed'
    students: Array<{ id: string; name: string; status: string }>
  } | null>(null)

  // Get dynamic semester stats
  const stats = useMemo(() => getStatsBySemester(selectedSemester.id), [selectedSemester.id])

  // Calculate attendance distribution from real students
  const attendanceDistribution = useMemo(() => {
    const excellent = realStudents.filter(s => s.attendanceRate >= 90).length
    const good = realStudents.filter(s => s.attendanceRate >= 75 && s.attendanceRate < 90).length
    const fair = realStudents.filter(s => s.attendanceRate >= 50 && s.attendanceRate < 75).length
    const atRisk = realStudents.filter(s => s.attendanceRate < 50).length
    return [
      { name: 'Excellent (90-100%)', value: excellent, color: '#22c55e' },
      { name: 'Good (75-89%)', value: good, color: '#3b82f6' },
      { name: 'Fair (50-74%)', value: fair, color: '#f59e0b' },
      { name: 'At Risk (<50%)', value: atRisk, color: '#ef4444' },
    ].filter(d => d.value > 0)
  }, [])

  // Real insight counts from student data
  const insightCounts = useMemo(() => {
    const highEngagement = realStudents.filter(s => s.attendanceRate >= 90).length
    const atRisk = realStudents.filter(s => s.attendanceRate < 50).length
    const notStarted = realStudents.filter(s => s.attendanceRate === 0).length
    return { highEngagement, atRisk, notStarted }
  }, [])

  const keyMetrics = useMemo(() => [
    { label: 'Total Students', value: stats.totalStudents.toString(), icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { label: 'Avg Engagement', value: `${stats.avgEngagement}%`, icon: Activity, color: 'text-green-600', bgColor: 'bg-green-100' },
    { label: 'Active Sessions', value: stats.activeSessions.toString(), icon: Calendar, color: 'text-purple-600', bgColor: 'bg-purple-100' },
    { label: 'Top Performers', value: stats.topPerformers.toString(), icon: Award, color: 'text-orange-600', bgColor: 'bg-orange-100' }
  ], [stats])

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Reports</h1>
              <p className="text-muted-foreground">Attendance, engagement, and drop-off evidence across recorded sessions</p>
            </div>
            <div className="flex gap-3 items-center">
              <SemesterSelector />
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Viewing data for: <span className="font-semibold text-foreground">{selectedSemester.name}</span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {keyMetrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
                  <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                    <metric.icon className={`h-4 w-4 ${metric.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{metric.value}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Engagement Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Engagement Trends
              </CardTitle>
              <CardDescription>Monthly engagement, attendance, and participation metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                Engagement data will appear after processing class recordings.
              </div>
            </CardContent>
          </Card>

          {/* Session Outcomes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Session Outcomes
              </CardTitle>
              <CardDescription>Expected attendance, confirmed presence, and completion by session</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Session</th>
                      <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Expected</th>
                      <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Present</th>
                      <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Biology 201 lecture recording', enrolled: 45, completed: 38 },
                      { name: 'Company onboarding webinar', enrolled: 52, completed: 47 },
                      { name: 'Admissions open house', enrolled: 38, completed: 31 },
                      { name: 'Executive training session', enrolled: 41, completed: 35 },
                      { name: 'Conference breakout room', enrolled: 48, completed: 42 },
                    ].map((session, index) => {
                      const completionRate = Math.round((session.completed / session.enrolled) * 100)
                      const participants = sessionParticipants[session.name as keyof typeof sessionParticipants]?.enrolled || []
                      const expectedParticipants = participants
                      const presentParticipants = participants.filter(s => s.status === 'completed')
                      
                      return (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-2 text-sm text-gray-900">{session.name}</td>
                          <td className="text-center py-3 px-2">
                            <button 
                              onClick={() => {
                                setModalData({
                                  sessionName: session.name,
                                  type: 'enrolled',
                                  students: expectedParticipants
                                })
                                setModalOpen(true)
                              }}
                              className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              {session.enrolled}
                            </button>
                          </td>
                          <td className="text-center py-3 px-2">
                            <button 
                              onClick={() => {
                                setModalData({
                                  sessionName: session.name,
                                  type: 'completed',
                                  students: presentParticipants
                                })
                                setModalOpen(true)
                              }}
                              className="text-sm font-semibold text-green-600 hover:text-green-800 hover:underline cursor-pointer"
                            >
                              {session.completed}
                            </button>
                          </td>
                          <td className="text-center py-3 px-2">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${completionRate}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-medium text-gray-700">{completionRate}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Attendance Distribution */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Attendance Distribution
            </CardTitle>
            <CardDescription>Participant attendance rate breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RePieChart>
                <Pie
                  data={attendanceDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {attendanceDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Insights Summary */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Key Insights</CardTitle>
            <CardDescription>Calculated from current participant data ({realStudents.length} people)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <div className="font-semibold text-blue-900">Tracked Audience</div>
                  <p className="text-sm text-blue-700">{realStudents.length} participants are enrolled in the current workspace. {insightCounts.highEngagement > 0 ? `${insightCounts.highEngagement} participant${insightCounts.highEngagement !== 1 ? 's' : ''} with attendance >= 90%.` : 'Sessions have not started yet - attendance data will populate once recordings are processed.'}</p>
                </div>
              </div>
              {insightCounts.atRisk > 0 && (
                <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-orange-900">Follow-Up Needed</div>
                    <p className="text-sm text-orange-700">{insightCounts.atRisk} participant{insightCounts.atRisk !== 1 ? 's' : ''} with attendance below 50% - follow-up recommended.</p>
                  </div>
                </div>
              )}
              {insightCounts.notStarted > 0 && (
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <Calendar className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-yellow-900">Not Started</div>
                    <p className="text-sm text-yellow-700">{insightCounts.notStarted} participant{insightCounts.notStarted !== 1 ? 's' : ''} have not attended any sessions yet.</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Participant List Modal */}
      {modalOpen && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl max-w-2xl w-full p-6 relative shadow-2xl max-h-[80vh] overflow-y-auto"
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-2xl font-bold mb-2">
              {modalData.type === 'enrolled' ? 'Expected Participants' : 'Confirmed Participants'}
            </h2>
            <p className="text-sm text-gray-600 mb-6">{modalData.sessionName}</p>

            {modalData.students.length > 0 ? (
              <div className="space-y-2">
                {modalData.students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                        {student.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{student.name}</p>
                        <p className="text-sm text-gray-500">{student.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {student.status === 'completed' ? (
                        <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                          <CheckCircle className="h-4 w-4" />
                          Present
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                          <Activity className="h-4 w-4" />
                          Expected
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <XCircle className="h-12 w-12 mb-3" />
                <p>No participants found</p>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setModalOpen(false)}>Close</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
