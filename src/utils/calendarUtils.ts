/**
 * Calendar utility functions for creating calendar events
 */

export interface CalendarEvent {
  title: string
  description: string
  location: string
  startDate: string // Format: "Oct 28, 2025"
  startTime: string // Format: "2:00 PM"
  endTime: string   // Format: "4:00 PM"
  instructor?: string
}

/**
 * Convert date and time strings to ISO format for calendar
 */
function parseDateTime(dateStr: string, timeStr: string): Date {
  // Parse date like "Oct 28, 2025"
  const date = new Date(dateStr)
  
  // Parse time like "2:00 PM"
  const [time, period] = timeStr.split(' ')
  const [hours, minutes] = time.split(':').map(Number)
  
  let hour24 = hours
  if (period === 'PM' && hours !== 12) hour24 += 12
  if (period === 'AM' && hours === 12) hour24 = 0
  
  date.setHours(hour24, minutes, 0, 0)
  return date
}

/**
 * Format date for Google Calendar URL (YYYYMMDDTHHmmss)
 */
function formatGoogleCalendarDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}`
}

/**
 * Generate Google Calendar URL
 */
export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const startDateTime = parseDateTime(event.startDate, event.startTime)
  const endDateTime = parseDateTime(event.startDate, event.endTime)
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleCalendarDate(startDateTime)}/${formatGoogleCalendarDate(endDateTime)}`,
    details: event.description + (event.instructor ? `\n\nInstructor: ${event.instructor}` : ''),
    location: event.location,
  })
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Generate ICS file content for download (works with all calendar apps)
 */
export function generateICSFile(event: CalendarEvent): string {
  const startDateTime = parseDateTime(event.startDate, event.startTime)
  const endDateTime = parseDateTime(event.startDate, event.endTime)
  
  // Format for ICS: YYYYMMDDTHHmmss
  const formatICS = (date: Date) => {
    return formatGoogleCalendarDate(date).replace(/[-:]/g, '')
  }
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HighView//Session Calendar//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatICS(startDateTime)}`,
    `DTEND:${formatICS(endDateTime)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description}${event.instructor ? `\\n\\nInstructor: ${event.instructor}` : ''}`,
    `LOCATION:${event.location}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  
  return icsContent
}

/**
 * Download ICS file
 */
export function downloadICSFile(event: CalendarEvent): void {
  const icsContent = generateICSFile(event)
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Add to calendar with multiple options
 */
export function addToCalendar(event: CalendarEvent, provider: 'google' | 'ics' = 'google'): void {
  if (provider === 'google') {
    const url = generateGoogleCalendarUrl(event)
    window.open(url, '_blank')
  } else {
    downloadICSFile(event)
  }
}
