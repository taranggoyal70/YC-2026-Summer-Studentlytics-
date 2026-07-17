import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanFace, Menu, X, Users, User, LogOut, UserCircle, Settings } from 'lucide-react'
import { SignOutButton, UserButton, useAuth, useUser } from '@clerk/react'
import { Button } from './ui/button'
import { getClerkRole, getDisplayName } from '../auth/clerk'

const studentNavItems = [
  { name: 'Home', href: '/' },
  { name: 'Sessions', href: '/sessions' },
  { name: 'Profile', href: '/profile' },
]

const staffNavItems = [
  { name: 'Home', href: '/' },
  { name: 'Command Center', href: '/dashboard' },
  { name: 'Sessions', href: '/sessions' },
  { name: 'Attendance', href: '/attendance' },
  { name: 'Engagement', href: '/analytics' },
  { name: 'People', href: '/students' },
  { name: 'Integrations', href: '/integrations' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const { isSignedIn } = useAuth()
  const { user } = useUser()

  const userRole = getClerkRole(user)
  const displayName = getDisplayName(user)
  const userEmail = user?.primaryEmailAddress?.emailAddress

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const handleLogout = () => {
    setIsProfileMenuOpen(false)
    navigate('/login')
  }

  // Get navigation items based on user role
  const isStaff = userRole === 'teacher' || userRole === 'admin'
  const navItems = isStaff ? staffNavItems : studentNavItems

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="flex items-center gap-3">
              {/* Circle Logo */}
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                <ScanFace className="h-8 w-8 text-white" />
              </div>
              {/* Company Name & Tagline */}
              <div className="flex flex-col">
                <span className="text-xl font-bold text-primary">
                  Studentlytics
                </span>
                <span className="text-xs text-muted-foreground italic">
                  Presence Intelligence Platform
                </span>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
              >
                {item.name}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full" />
              </Link>
            ))}
          </div>

          {/* Desktop Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {isSignedIn ? (
              <>
                {/* Role Badge (non-clickable) */}
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                  isStaff
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {isStaff ? (
                    <>
                      <Users className="h-4 w-4" />
                      {userRole === 'admin' ? 'Admin' : 'Teacher'}
                    </>
                  ) : (
                    <>
                      <User className="h-4 w-4" />
                      Participant
                    </>
                  )}
                </div>
                {/* User Profile with Dropdown */}
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                      className="text-sm font-medium hidden md:block hover:opacity-80 transition-opacity"
                    >
                      {displayName}
                    </button>
                    <UserButton />
                  </div>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {isProfileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-border overflow-hidden z-50"
                      >
                        {/* Profile Header */}
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-semibold">{displayName}</p>
                              <p className="text-xs text-muted-foreground">{userEmail}</p>
                            </div>
                          </div>
                        </div>

                        {/* Menu Items */}
                        <div className="py-2">
                          <button
                            onClick={() => {
                              setIsProfileMenuOpen(false)
                              navigate('/profile')
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
                          >
                            <UserCircle className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">My Profile</p>
                              <p className="text-xs text-muted-foreground">Privacy and account data</p>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setIsProfileMenuOpen(false)
                              navigate('/settings')
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
                          >
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Settings</p>
                              <p className="text-xs text-muted-foreground">Preferences and privacy</p>
                            </div>
                          </button>
                          <div className="border-t my-2"></div>
                          <SignOutButton redirectUrl="/login">
                            <button
                              onClick={handleLogout}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left text-red-600"
                            >
                              <LogOut className="h-4 w-4" />
                              <div>
                                <p className="text-sm font-medium">Log Out</p>
                                <p className="text-xs opacity-75">Sign out of your account</p>
                              </div>
                            </button>
                          </SignOutButton>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Login
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="sm" className="shadow-lg shadow-primary/20">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          >
            <div className="container mx-auto px-4 py-4 space-y-3">
              {/* Mobile Navigation Links */}
              {navItems.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Link
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                  >
                    {item.name}
                  </Link>
                </motion.div>
              ))}

              {/* Mobile Action Buttons */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: navItems.length * 0.05 }}
                className="pt-3 space-y-2 border-t border-border/40"
              >
                {isSignedIn ? (
                  <>
                    <Link to="/profile" className="block" onClick={() => setIsMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full" size="sm">
                        Profile
                      </Button>
                    </Link>
                    <SignOutButton redirectUrl="/login">
                      <Button variant="ghost" className="w-full text-red-600" size="sm">
                        Log Out
                      </Button>
                    </SignOutButton>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="block">
                      <Button variant="ghost" className="w-full" size="sm">
                        Login
                      </Button>
                    </Link>
                    <Link to="/login" className="block">
                      <Button className="w-full shadow-lg shadow-primary/20" size="sm">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
