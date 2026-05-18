import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Clock, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { realStudents } from '../data/transformStudents'

export default function CoursesPage() {
  // Generate courses from real student cohorts
  const courses = useMemo(() => {
    const cohorts = [...new Set(realStudents.map(s => s.cohort))]
    
    const courseDescriptions: Record<string, { description: string; audience: string; duration: string }> = {
      'Fall 2024': {
        description: 'An introductory AI course designed for college freshmen. Covers core concepts, tools, and real-world applications of artificial intelligence.',
        audience: 'Freshmen',
        duration: '12 weeks',
      },
      'Spring 2025': {
        description: 'A sophomore-level course building on AI fundamentals. Explores intermediate AI concepts, data analysis, and hands-on projects.',
        audience: 'Sophomores',
        duration: '12 weeks',
      },
      'Summer 2025': {
        description: 'A practical course for upperclassmen on leveraging AI tools for career development, job searching, networking, and professional growth.',
        audience: 'Sophomores, Juniors & Seniors',
        duration: '8 weeks',
      },
    }
    
    return cohorts.map(cohort => {
      const studentsInCohort = realStudents.filter(s => s.cohort === cohort)
      const courseInfo = courseDescriptions[cohort] || {
        description: `Advanced course for ${cohort} cohort students.`,
        audience: 'All levels',
        duration: '12 weeks',
      }
      
      return {
        title: cohort,
        description: courseInfo.description,
        audience: courseInfo.audience,
        students: studentsInCohort.length,
        duration: courseInfo.duration,
      }
    })
  }, [])
  return (
    <div className="container mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl font-bold mb-4">Courses</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Explore our comprehensive course offerings
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course, index) => (
            <motion.div
              key={course.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full hover:shadow-lg transition-shadow">
                <CardHeader>
                  <BookOpen className="h-10 w-10 text-primary mb-3" />
                  <div className="mb-2">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                      {course.audience}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{course.title}</CardTitle>
                  <CardDescription>{course.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{course.students} students</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{course.duration}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
