import { requireApiEndpoint } from '../config/api'
import { getAuthHeaders } from './authToken'

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${requireApiEndpoint()}${path}`, {
    headers: await getAuthHeaders(),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? `Request failed with status ${response.status}`)
  }
  return response.json()
}

export interface SessionSummary {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  location: string | null
  kind: 'virtual' | 'in-person'
  status: string
  space_name: string
  roster_count: number
  recording_count: number
  latest_job_status: string | null
}

export interface AttendanceDecision {
  id: string
  participant_id: string
  participant_name: string
  external_id: string
  status: string
  confidence: number | null
  check_in_seconds: number | null
  check_out_seconds: number | null
  duration_present_seconds: number | null
  left_early: boolean
  returned_after_leave: boolean
  camera_on: boolean
  word_count: number
  questions_asked: number
  engagement_score: number | null
  engagement_breakdown: Record<string, number> | null
  presence_windows: { start_seconds: number; end_seconds: number }[]
}

export interface SessionReport {
  session: SessionSummary
  decisions: AttendanceDecision[]
}

export interface AnalyticsOverview {
  participants: number
  sessions: number
  analyses_completed: number
  attendance_rate: number | null
  average_engagement: number | null
}

export interface LeaderboardEntry {
  id: string
  external_id: string
  name: string
  email: string | null
  major: string | null
  cohort: string | null
  sessions_analyzed: number
  sessions_attended: number
  attendance_rate: number | null
  avg_engagement: number | null
  total_words: number | null
  total_questions: number | null
}

export function listSessions(): Promise<SessionSummary[]> {
  return request('/sessions')
}

export async function createSession(payload: {
  title: string
  starts_at?: string
  ends_at?: string
  location?: string
  kind?: 'virtual' | 'in-person'
}): Promise<SessionSummary> {
  const response = await fetch(`${requireApiEndpoint()}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? 'Failed to create session')
  }
  return response.json()
}

export function getSessionReport(sessionId: string): Promise<SessionReport> {
  return request(`/sessions/${encodeURIComponent(sessionId)}/report`)
}

export function getOverview(): Promise<AnalyticsOverview> {
  return request('/analytics/overview')
}

export function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return request('/analytics/leaderboard')
}
