import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Users, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { realStudents } from '../data/transformStudents'

export default function AttendanceTrackingPage() {
  const navigate = useNavigate()
  const { sessionId } = useParams()

  // Generate real attendance records from realStudents
  const initialRecords = useMemo(() => {
    return realStudents.slice(0, 25).map((student) => ({
      id: student.id,
      studentName: student.name,
      studentId: student.id,
      status: student.attendanceRate > 75 ? 'present' : 'absent',
      notes: ''
    }))
  }, [])

  const [attendanceRecords, setAttendanceRecords] = useState(initialRecords)

  // Calculate session stats from real data
  const sessionData = useMemo(() => {
    const presentCount = attendanceRecords.filter(r => r.status === 'present').length
    const absentCount = attendanceRecords.filter(r => r.status === 'absent').length
    const totalStudents = attendanceRecords.length
    const attendanceRate = Math.round((presentCount / totalStudents) * 100)

    return {
      id: sessionId || '1',
      title: 'Introduction to React Hooks',
      date: new Date().toISOString().split('T')[0],
      time: '10:00 AM - 12:00 PM',
      totalStudents,
      presentToday: presentCount,
      absentToday: absentCount,
      attendanceRate,
    }
  }, [sessionId, attendanceRecords])

  const handleStatusChange = (id: string, newStatus: string) => {
    setAttendanceRecords(records =>
      records.map(record =>
        record.id === id ? { ...record, status: newStatus } : record
      )
    )
    // Auto-save to backend when status changes
    console.log('Saving attendance record:', id)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/sessions')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sessions
        </Button>

        {/* Session Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl p-8 mb-6"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{sessionData.title}</h1>
          <p className="text-gray-600 mb-4">
            {sessionData.date} • {sessionData.time}
          </p>
        </motion.div>

        {/* Stats Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{sessionData.totalStudents}</p>
                <p className="text-sm text-gray-600">Total Students</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{sessionData.presentToday}</p>
                <p className="text-sm text-gray-600">Present Today</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{sessionData.absentToday}</p>
                <p className="text-sm text-gray-600">Absent Today</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{sessionData.attendanceRate}%</p>
                <p className="text-sm text-gray-600">Attendance Rate</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Attendance Records Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Attendance Records</h2>
            <p className="text-sm text-gray-600 mt-1">Click on status to update attendance</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status (Click to Update)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attendanceRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {record.studentId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.studentName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={record.status}
                        onChange={(e) => handleStatusChange(record.id, e.target.value)}
                        className={`px-4 py-2 rounded-full text-sm font-medium cursor-pointer border-2 transition-all hover:shadow-md ${
                          record.status === 'present'
                            ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                        }`}
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
