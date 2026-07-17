import { motion } from 'framer-motion'
import { Search, Plus, Eye, Mail, BarChart3, ChevronLeft, ChevronRight, Activity } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { useState, useEffect, useMemo } from 'react'
import { getAllStudents, addStudent } from '../services/api'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

interface StudentRecord {
  record_id: string
  attendance: number
  class_name: string
  department: string
  engagement: number
  grade: number
  photo_url: string
  session_date: string
  speaking_time: number
  student_email: string
  student_id: string
  student_name: string
  teacher_name: string
  topic: string
}

const getStatusColor = (attendance: number) => {
  if (attendance >= 80) return 'bg-green-100 text-green-800 border-green-200'
  if (attendance >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  return 'bg-red-100 text-red-800 border-red-200'
}

function normalizeStudent(student: any): StudentRecord {
  return {
    record_id: student.record_id ?? `local#${student.student_id ?? student.id}`,
    attendance: Number(student.attendance ?? student.attendanceRate ?? 0),
    class_name: student.class_name ?? student.class ?? student.major ?? '',
    department: student.department ?? student.university ?? '',
    engagement: Number(student.engagement ?? student.engagementScore ?? 0),
    grade: Number(student.grade ?? 0),
    photo_url: student.photo_url ?? student.picture ?? '',
    session_date: student.session_date ?? student.enrollmentDate ?? '',
    speaking_time: Number(student.speaking_time ?? 0),
    student_email: student.student_email ?? student.email ?? '',
    student_id: student.student_id ?? student.id ?? '',
    student_name: student.student_name ?? student.name ?? '',
    teacher_name: student.teacher_name ?? 'Studentlytics Staff',
    topic: student.topic ?? student.cohort ?? '',
  }
}

export default function StudentsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterClass, setFilterClass] = useState('all')
  const [apiStudents, setApiStudents] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setLoading(true)
        const students = await getAllStudents()
        setApiStudents(students.map(normalizeStudent))
        setError(null)
      } catch (err) {
        setApiStudents([])
        setError(err instanceof Error ? err.message : 'Unable to load students')
      } finally {
        setLoading(false)
      }
    }

    fetchStudents()
  }, [])

  const handleAddStudent = async () => {
    const studentName = window.prompt('Participant full name')
    if (!studentName) return
    const studentId = window.prompt('Participant ID')
    if (!studentId) return
    const studentEmail = window.prompt('Participant email') ?? ''
    const className = window.prompt('Session or group name') ?? ''

    try {
      await addStudent({
        student_id: studentId,
        student_name: studentName,
        student_email: studentEmail,
        class_name: className,
        attendance: 0,
        engagement: 0,
        grade: 0,
        session_date: new Date().toISOString().slice(0, 10),
      })
      const data = await getAllStudents()
      setApiStudents(data.map(normalizeStudent))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add student')
    }
  }

  const allStudents = apiStudents

  const classOptions = useMemo(() => (
    [...new Set(allStudents.map(student => student.class_name).filter(Boolean))]
  ), [allStudents])

  const weeklyActivity = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    return days.map((day, index) => {
      const dayStudents = allStudents.filter((_, studentIndex) => studentIndex % days.length === index)
      return {
        day,
        sessions: new Set(dayStudents.map(student => student.class_name)).size,
        students: dayStudents.length,
      }
    })
  }, [allStudents])
  
  const filteredStudents = allStudents.filter((student: any) => {
    const name = student.student_name || student.name || ''
    const id = student.student_id || student.id || ''
    const className = student.class_name || student.class || ''
    
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         id.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesClass = filterClass === 'all' || className === filterClass
    return matchesSearch && matchesClass
  })

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">People & Face Roster</h1>
              <p className="text-muted-foreground">
                Manage participants, consent records, face enrollment, and engagement history
              </p>
            </div>
            <Button className="gap-2" onClick={handleAddStudent}>
              <Plus className="h-4 w-4" />
              Add Participant
            </Button>
          </div>

          {/* Loading State */}
          {loading && (
            <Card className="p-6 mb-6">
              <p className="text-center text-muted-foreground">Loading participants from database...</p>
            </Card>
          )}

          {/* Error State - Subtle warning */}
          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
              <span>{error}. Start the local backend to load the roster.</span>
            </div>
          )}

          {/* API Data Display - Subtle success indicator */}
          {!loading && apiStudents.length > 0 && (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-600">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>Connected to local roster • {apiStudents.length} record(s) loaded</span>
            </div>
          )}

          {/* Search and Filters */}
          <Card className="p-6 mb-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name or participant ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Groups</option>
                {classOptions.map(className => (
                  <option key={className} value={className}>{className}</option>
                ))}
              </select>
            </div>
          </Card>

          {/* Desktop Table View */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-semibold">Participant ID</th>
                    <th className="text-left p-4 font-semibold">Name</th>
                    <th className="text-left p-4 font-semibold">Group</th>
                    <th className="text-left p-4 font-semibold">Attendance</th>
                    <th className="text-left p-4 font-semibold">Engagement</th>
                    <th className="text-left p-4 font-semibold">Last Active</th>
                    <th className="text-left p-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student: any, index: number) => (
                    <motion.tr
                      key={student.student_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-4 font-medium">{student.student_id}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {student.photo_url?.startsWith('http') || student.photo_url?.startsWith('s3://') ? (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                              {student.student_name?.charAt(0) || '?'}
                            </div>
                          ) : (
                            <div className="text-3xl">👨‍🎓</div>
                          )}
                          <span className="font-medium">{student.student_name}</span>
                        </div>
                      </td>
                      <td className="p-4">{student.class_name}</td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(student.attendance)}`}>
                          {student.attendance.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-secondary rounded-full h-2 w-20">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${student.engagement}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{student.engagement.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{student.session_date}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filteredStudents.map((student: any, index: number) => (
              <motion.div
                key={student.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{student.photo_url || student.photo || '👨‍🎓'}</div>
                      <div>
                        <h3 className="font-semibold">{student.student_name || student.name}</h3>
                        <p className="text-sm text-muted-foreground">{student.student_id || student.id}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(student.attendance)}`}>
                      {student.attendance.toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Group:</span>
                      <span className="font-medium">{student.class_name || student.class}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Engagement:</span>
                      <span className="font-medium">{student.engagement.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Active:</span>
                      <span className="font-medium">{student.session_date || student.lastActive}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1">
                      <Mail className="h-4 w-4 mr-1" />
                      Message
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-muted-foreground">
              Showing {filteredStudents.length} of {allStudents.length} participants {apiStudents.length > 0 && '(from local roster)'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm">1</Button>
              <Button variant="outline" size="sm" disabled>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Weekly Activity */}
          <Card className="mt-8">
            <div className="p-6 border-b">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Weekly Activity</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Sessions and participant activity by day</p>
            </div>
            <div className="p-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyActivity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sessions" fill="#8b5cf6" name="Sessions" />
                  <Bar dataKey="students" fill="#10b981" name="Participants" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
