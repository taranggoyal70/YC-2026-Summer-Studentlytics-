import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Users, CheckCircle, XCircle, Clock, Download, Search } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SemesterSelector } from '@/components/SemesterSelector'
import { useSemester } from '@/contexts/SemesterContext'
import { getAttendanceBySemester } from '@/data/semesterData'

export default function AttendancePage() {
  const { selectedSemester } = useSemester()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>('all')

  // Get semester-specific attendance data
  const semesterAttendance = useMemo(() => {
    return getAttendanceBySemester(selectedSemester.id)
  }, [selectedSemester.id])

  // Calculate accurate attendance stats from actual attendance records
  const attendanceStats = useMemo(() => {
    const totalStudents = semesterAttendance.length
    const presentCount = semesterAttendance.filter(r => r.status === 'present').length
    const absentCount = semesterAttendance.filter(r => r.status === 'absent').length
    
    // Calculate attendance rate: present / total * 100
    const attendanceRate = totalStudents > 0 
      ? Math.round((presentCount / totalStudents) * 100)
      : 0
    
    return [
      { label: 'Total People', value: totalStudents.toString(), icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-100' },
      { label: 'Present Today', value: presentCount.toString(), icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
      { label: 'Absent Today', value: absentCount.toString(), icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
      { label: 'Attendance Rate', value: `${attendanceRate}%`, icon: Calendar, color: 'text-purple-600', bgColor: 'bg-purple-100' }
    ]
  }, [semesterAttendance])

  const filteredData = semesterAttendance.filter(record => {
    const matchesSearch = record.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         record.studentId.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || record.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'bg-green-100 text-green-800'
      case 'absent': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Attendance Timeline</h1>
              <p className="text-muted-foreground">Track check-ins, check-outs, duration, and absences across sessions</p>
            </div>
            <SemesterSelector />
          </div>
          <div className="text-sm text-muted-foreground">
            Viewing data for: <span className="font-semibold text-foreground">{selectedSemester.name}</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {attendanceStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Attendance Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Attendance Records</CardTitle>
                <CardDescription>Review participant presence for the latest processed sessions</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col md:flex-row gap-4 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or participant ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === 'present' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('present')}
                >
                  Present
                </Button>
                <Button
                  variant={filterStatus === 'absent' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('absent')}
                >
                  Absent
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Participant</th>
                    <th className="text-left p-4 font-medium">Participant ID</th>
                    <th className="text-left p-4 font-medium">Session</th>
                    <th className="text-left p-4 font-medium">Check In</th>
                    <th className="text-left p-4 font-medium">Check Out</th>
                    <th className="text-left p-4 font-medium">Duration</th>
                    <th className="text-left p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((record) => (
                    <motion.tr
                      key={record.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-4">
                        <div className="font-medium">{record.studentName}</div>
                      </td>
                      <td className="p-4 text-muted-foreground">{record.studentId}</td>
                      <td className="p-4 text-sm">{record.sessionName}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{record.checkIn}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{record.checkOut || '-'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm">{record.duration}</td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
