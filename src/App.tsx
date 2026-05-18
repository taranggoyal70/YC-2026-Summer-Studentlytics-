import { Routes, Route } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import AboutPage from './pages/AboutPage'
import ServicesPage from './pages/ServicesPage'
import StudentsPage from './pages/StudentsPage'
import CoursesPage from './pages/CoursesPage'
import SessionsPage from './pages/SessionsPage'
import LoginPage from './pages/LoginPage'
import StudentLoginPage from './pages/StudentLoginPage'
import TeacherLoginPage from './pages/TeacherLoginPage'
import StudentSignupPage from './pages/StudentSignupPage'
import TeacherSignupPage from './pages/TeacherSignupPage'
import DashboardPage from './pages/DashboardPage'
import AttendancePage from './pages/AttendancePage'
import LeaderboardPage from './pages/LeaderboardPage'
import AnalyticsPage from './pages/AnalyticsPage'
import CohortPage from './pages/CohortPage'
import StudentProfilePage from './pages/StudentProfilePage'
import OpportunitiesPage from './pages/OpportunitiesPage'
import PrivacyPage from './pages/PrivacyPage'
import ProfilePage from './pages/ProfilePage'
import AttendanceTrackingPage from './pages/AttendanceTrackingPage'
import AddOpportunityPage from './pages/AddOpportunityPage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/student" element={<StudentLoginPage />} />
      <Route path="/login/teacher" element={<TeacherLoginPage />} />
      <Route path="/signup/student" element={<StudentSignupPage />} />
      <Route path="/signup/teacher" element={<TeacherSignupPage />} />
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={['teacher', 'admin']}>
          <DashboardPage />
        </ProtectedRoute>
      } />
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/students" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <StudentsPage />
          </ProtectedRoute>
        } />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/attendance" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <AttendancePage />
          </ProtectedRoute>
        } />
        <Route path="/leaderboard" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <LeaderboardPage />
          </ProtectedRoute>
        } />
        <Route path="/analytics" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <AnalyticsPage />
          </ProtectedRoute>
        } />
        <Route path="/cohort" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <CohortPage />
          </ProtectedRoute>
        } />
        <Route path="/cohort/:studentId" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <StudentProfilePage />
          </ProtectedRoute>
        } />
        <Route path="/explore" element={<OpportunitiesPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/sessions/:sessionId/attendance" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <AttendanceTrackingPage />
          </ProtectedRoute>
        } />
        <Route path="/opportunities/add" element={
          <ProtectedRoute allowedRoles={['teacher', 'admin']}>
            <AddOpportunityPage />
          </ProtectedRoute>
        } />
        {/* Catch-all route for 404 */}
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  )
}

export default App
