import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Trophy, Medal, TrendingUp, Users, Target, Zap, ArrowUpDown, ArrowUp, ArrowDown, Lock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SemesterSelector } from '@/components/SemesterSelector'
import { useSemester } from '@/contexts/SemesterContext'
import { getStudentsBySemester, calculateTrend } from '@/data/semesterData'

interface LeaderboardEntry {
  rank: number
  studentName: string
  studentId: string
  engagementScore: number
  attendanceRate: number
  participationPoints: number
  totalPoints: number
  trend: 'up' | 'down' | 'same'
  avatar?: string
}

type SortColumn = 'rank' | 'engagement' | 'attendance' | 'participation' | 'totalPoints'
type SortDirection = 'asc' | 'desc'

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { selectedSemester } = useSemester()
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'semester'>('week')
  const [sortColumn, setSortColumn] = useState<SortColumn>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [userRole, setUserRole] = useState<'teacher' | 'student'>('student')

  // Check user role and redirect students
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const user = JSON.parse(userData)
      setUserRole(user.type || 'student')
      
      // Redirect students away from leaderboard
      if (user.type === 'student') {
        navigate('/')
      }
    }
  }, [navigate])

  // If student, show access denied message while redirecting
  if (userRole === 'student') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-12 max-w-md text-center"
        >
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="h-10 w-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Restricted</h1>
          <p className="text-gray-600 mb-6">
            The Leaderboard is only accessible to staff members. You will be redirected to the home page.
          </p>
          <Button onClick={() => navigate('/')} className="w-full">
            Go to Home
          </Button>
        </motion.div>
      </div>
    )
  }

  // Get semester-specific student data
  const semesterStudents = useMemo(() => {
    return getStudentsBySemester(selectedSemester.id)
  }, [selectedSemester.id])

  // Convert to leaderboard format with rankings using actual trend data
  const baseLeaderboardData: LeaderboardEntry[] = useMemo(() => {
    return semesterStudents.map((student, index) => ({
      rank: index + 1,
      studentName: student.name,
      studentId: student.studentId,
      engagementScore: student.engagementScore,
      attendanceRate: student.attendanceRate,
      participationPoints: student.participationPoints,
      totalPoints: student.totalPoints,
      trend: calculateTrend(student)
    }))
  }, [semesterStudents])

  // Sort leaderboard data based on selected column and direction
  const mockLeaderboardData = useMemo(() => {
    const sorted = [...baseLeaderboardData].sort((a, b) => {
      let aValue: number, bValue: number
      
      switch (sortColumn) {
        case 'engagement':
          aValue = a.engagementScore
          bValue = b.engagementScore
          break
        case 'attendance':
          aValue = a.attendanceRate
          bValue = b.attendanceRate
          break
        case 'participation':
          aValue = a.participationPoints
          bValue = b.participationPoints
          break
        case 'totalPoints':
          aValue = a.totalPoints
          bValue = b.totalPoints
          break
        case 'rank':
        default:
          aValue = a.rank
          bValue = b.rank
          break
      }
      
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
    
    // Update ranks after sorting
    return sorted.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }))
  }, [baseLeaderboardData, sortColumn, sortDirection])

  // Update top performers based on current semester data
  const topPerformers = useMemo(() => {
    if (semesterStudents.length === 0) return []
    const sorted = [...semesterStudents].sort((a, b) => b.engagementScore - a.engagementScore)
    const topEngagement = sorted[0]
    const topAttendance = [...semesterStudents].sort((a, b) => b.attendanceRate - a.attendanceRate)[0]
    const topParticipation = [...semesterStudents].sort((a, b) => b.participationPoints - a.participationPoints)[0]
    
    // Find fastest improver - student with upward trend and highest engagement among trending up students
    const improvingStudents = mockLeaderboardData.filter(s => s.trend === 'up')
    const fastestImprover = improvingStudents.length > 0 
      ? improvingStudents.sort((a, b) => b.engagementScore - a.engagementScore)[0]
      : null
    
    return [
      { category: 'Highest Engagement', student: topEngagement.name, score: `${topEngagement.engagementScore}%`, icon: Zap },
      { category: 'Best Attendance', student: topAttendance.name, score: `${topAttendance.attendanceRate}%`, icon: Target },
      { category: 'Most Participation', student: topParticipation.name, score: `${topParticipation.participationPoints} pts`, icon: Users },
      { category: 'Fastest Improver', student: fastestImprover?.studentName || topEngagement.name, score: '+15%', icon: TrendingUp }
    ]
  }, [semesterStudents, mockLeaderboardData])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-6 w-6 text-yellow-500" />
      case 2:
        return <Medal className="h-6 w-6 text-gray-400" />
      case 3:
        return <Medal className="h-6 w-6 text-amber-600" />
      default:
        return <div className="h-6 w-6 flex items-center justify-center font-bold text-muted-foreground">{rank}</div>
    }
  }


  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'down':
        return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />
      default:
        return <div className="h-4 w-4" />
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Student Leaderboard</h1>
              <p className="text-muted-foreground">Track top performers and student rankings</p>
            </div>
            <SemesterSelector />
          </div>
          <div className="text-sm text-muted-foreground mb-4">
            Viewing data for: <span className="font-semibold text-foreground">{selectedSemester.name}</span>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={timeframe === 'week' ? 'default' : 'outline'}
            onClick={() => setTimeframe('week')}
          >
            This Week
          </Button>
          <Button
            variant={timeframe === 'month' ? 'default' : 'outline'}
            onClick={() => setTimeframe('month')}
          >
            This Month
          </Button>
          <Button
            variant={timeframe === 'semester' ? 'default' : 'outline'}
            onClick={() => setTimeframe('semester')}
          >
            This Semester
          </Button>
        </div>

        {/* Top Performers */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {topPerformers.map((performer, index) => (
            <motion.div
              key={performer.category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{performer.category}</CardTitle>
                  <performer.icon className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{performer.student}</div>
                  <p className="text-sm text-muted-foreground mt-1">{performer.score}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Top 3 Podium */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {/* 2nd Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col items-center"
          >
            <Card className="w-full border-2 border-gray-300">
              <CardContent className="pt-6 text-center">
                <div className="mb-4">
                  <Medal className="h-16 w-16 text-gray-400 mx-auto" />
                </div>
                <div className="text-2xl font-bold mb-1">{mockLeaderboardData[1].studentName}</div>
                <div className="text-sm text-muted-foreground mb-3">{mockLeaderboardData[1].studentId}</div>
                <div className="text-3xl font-bold text-gray-500">{mockLeaderboardData[1].totalPoints}</div>
                <div className="text-xs text-muted-foreground">points</div>
              </CardContent>
            </Card>
          </motion.div>

          {/* 1st Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center -mt-4"
          >
            <Card className="w-full border-2 border-yellow-500 shadow-lg">
              <CardContent className="pt-6 text-center">
                <div className="mb-4">
                  <Trophy className="h-20 w-20 text-yellow-500 mx-auto" />
                </div>
                <div className="text-2xl font-bold mb-1">{mockLeaderboardData[0].studentName}</div>
                <div className="text-sm text-muted-foreground mb-3">{mockLeaderboardData[0].studentId}</div>
                <div className="text-4xl font-bold text-yellow-600">{mockLeaderboardData[0].totalPoints}</div>
                <div className="text-xs text-muted-foreground">points</div>
              </CardContent>
            </Card>
          </motion.div>

          {/* 3rd Place */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <Card className="w-full border-2 border-amber-600">
              <CardContent className="pt-6 text-center">
                <div className="mb-4">
                  <Medal className="h-16 w-16 text-amber-600 mx-auto" />
                </div>
                <div className="text-2xl font-bold mb-1">{mockLeaderboardData[2].studentName}</div>
                <div className="text-sm text-muted-foreground mb-3">{mockLeaderboardData[2].studentId}</div>
                <div className="text-3xl font-bold text-amber-700">{mockLeaderboardData[2].totalPoints}</div>
                <div className="text-xs text-muted-foreground">points</div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Full Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Full Rankings</CardTitle>
            <CardDescription>Complete student leaderboard with detailed metrics</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Sort Controls */}
            <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b">
              <span className="text-sm text-muted-foreground mr-2 flex items-center">Sort by:</span>
              <Button
                variant={sortColumn === 'rank' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (sortColumn === 'rank') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortColumn('rank')
                    setSortDirection('asc')
                  }
                }}
              >
                Rank
                {sortColumn === 'rank' && (
                  sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
                )}
                {sortColumn !== 'rank' && <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />}
              </Button>
              <Button
                variant={sortColumn === 'engagement' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (sortColumn === 'engagement') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortColumn('engagement')
                    setSortDirection('desc')
                  }
                }}
              >
                Engagement
                {sortColumn === 'engagement' && (
                  sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
                )}
                {sortColumn !== 'engagement' && <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />}
              </Button>
              <Button
                variant={sortColumn === 'attendance' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (sortColumn === 'attendance') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortColumn('attendance')
                    setSortDirection('desc')
                  }
                }}
              >
                Attendance
                {sortColumn === 'attendance' && (
                  sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
                )}
                {sortColumn !== 'attendance' && <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />}
              </Button>
              <Button
                variant={sortColumn === 'participation' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (sortColumn === 'participation') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortColumn('participation')
                    setSortDirection('desc')
                  }
                }}
              >
                Participation
                {sortColumn === 'participation' && (
                  sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
                )}
                {sortColumn !== 'participation' && <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />}
              </Button>
              <Button
                variant={sortColumn === 'totalPoints' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (sortColumn === 'totalPoints') {
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                  } else {
                    setSortColumn('totalPoints')
                    setSortDirection('desc')
                  }
                }}
              >
                Total Points
                {sortColumn === 'totalPoints' && (
                  sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
                )}
                {sortColumn !== 'totalPoints' && <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />}
              </Button>
            </div>

            <div className="space-y-4">
              {mockLeaderboardData.map((entry, index) => (
                <motion.div
                  key={entry.studentId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  {/* Rank */}
                  <div className="flex items-center justify-center w-12">
                    {getRankIcon(entry.rank)}
                  </div>

                  {/* Student Info */}
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{entry.studentName}</div>
                    <div className="text-sm text-muted-foreground">{entry.studentId}</div>
                  </div>

                  {/* Metrics */}
                  <div className="hidden md:flex gap-6 text-sm">
                    <div className="text-center">
                      <div className="font-semibold">{entry.engagementScore}%</div>
                      <div className="text-xs text-muted-foreground">Engagement</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{entry.attendanceRate}%</div>
                      <div className="text-xs text-muted-foreground">Attendance</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{entry.participationPoints}</div>
                      <div className="text-xs text-muted-foreground">Participation</div>
                    </div>
                  </div>

                  {/* Total Points */}
                  <div className="text-right">
                    <div className="text-2xl font-bold">{entry.totalPoints}</div>
                    <div className="text-xs text-muted-foreground">total points</div>
                  </div>

                  {/* Trend */}
                  <div className="w-8">
                    {getTrendIcon(entry.trend)}
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
