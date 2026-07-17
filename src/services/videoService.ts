import { upload } from '@vercel/blob/client'
import { requireApiEndpoint } from '../config/api'
import { getAuthHeaders, getAuthToken } from './authToken'

// Analysis runs in a GitHub Actions worker; first runs take several minutes.
const MAX_PROCESSING_STATUS_CHECKS = 60
const PROCESSING_STATUS_INTERVAL_MS = 15000

export interface VideoUploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface AttendanceResult {
  studentId: string
  studentName: string
  confidence: number
  timestamp: string
  checkInAt: string | null
  checkOutAt: string | null
  durationPresentSeconds: number
  leftEarly: boolean
  returnedAfterLeave: boolean
  present: boolean
  status: 'present' | 'present_camera_off'
  wordCount: number
  questionsAsked: number
  cameraOn: boolean
  engagementScore: number
  engagementBreakdown?: {
    visual: number
    participation: number
    interaction: number
    consistency: number
  }
}

export interface EngagementMetrics {
  studentId: string
  attentionScore: number // 0-100
  headOrientation: 'forward' | 'left' | 'right' | 'down'
  speakingTime: number // seconds
  participationScore: number // 0-100
}

export interface VideoAnalysisResult {
  videoId: string
  sessionTitle: string
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  attendance: AttendanceResult[]
  engagement: EngagementMetrics[]
  totalDuration: number
  processedAt: string
  accuracy: number
}

// Shape returned by local FastAPI /videos/{id}/status
interface LocalJobStatus {
  video_id: string
  session_title: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  uploaded_at: string
  file_size_mb: number
  result: LocalResult | null
  error: string | null
}

interface LocalResult {
  video_id: string
  session_title: string
  processed_at: string
  duration_seconds: number
  frames_sampled: number
  enrolled_students: number
  attendance: {
    count: number
    total: number
    rate: number
    accuracy: number
  }
  engagement: {
    average_score: number
    at_risk_count: number
  }
  present_students: {
    student_id: string
    name: string
    frames_detected: number
    presence_ratio: number
    engagement_score: number
    status: 'present' | 'present_camera_off'
    word_count: number
    questions_asked: number
    camera_on: boolean
    engagement_breakdown?: {
      visual: number
      participation: number
      interaction: number
      consistency: number
    }
    check_in_at?: string | null
    check_out_at?: string | null
    duration_present_seconds?: number
    left_early?: boolean
    returned_after_leave?: boolean
    presence_windows?: {
      start: string
      end: string
      duration_seconds: number
    }[]
  }[]
  absent_students: {
    student_id: string
    name: string
    frames_detected: number
    status: string
  }[]
}

function mapToVideoAnalysisResult(job: LocalJobStatus): VideoAnalysisResult {
  const r = job.result

  const statusMap: Record<string, VideoAnalysisResult['processingStatus']> = {
    queued: 'pending',
    processing: 'processing',
    completed: 'completed',
    failed: 'failed',
  }

  const attendance: AttendanceResult[] = r
    ? r.present_students.map((s) => ({
        studentId: s.student_id,
        studentName: s.name,
        confidence: Math.round(s.presence_ratio * 100),
        timestamp: r.processed_at,
        checkInAt: s.check_in_at ?? null,
        checkOutAt: s.check_out_at ?? null,
        durationPresentSeconds: s.duration_present_seconds ?? 0,
        leftEarly: s.left_early ?? false,
        returnedAfterLeave: s.returned_after_leave ?? false,
        present: true,
        status: s.status,
        wordCount: s.word_count ?? 0,
        questionsAsked: s.questions_asked ?? 0,
        cameraOn: s.camera_on ?? true,
        engagementScore: Math.round(s.engagement_score),
        engagementBreakdown: s.engagement_breakdown,
      }))
    : []

  const engagement: EngagementMetrics[] = r
    ? r.present_students.map((s) => ({
        studentId: s.student_id,
        attentionScore: Math.round(s.engagement_score),
        headOrientation: 'forward' as const,
        speakingTime: 0,
        participationScore: Math.round(s.engagement_score),
      }))
    : []

  return {
    videoId: job.video_id,
    sessionTitle: job.session_title,
    processingStatus: statusMap[job.status] ?? 'pending',
    attendance,
    engagement,
    totalDuration: r?.duration_seconds ?? 0,
    processedAt: r?.processed_at ?? job.uploaded_at,
    accuracy: r?.attendance.accuracy ?? 0,
  }
}

class VideoService {
  private getApiEndpoint(): string {
    return requireApiEndpoint()
  }

  /**
   * Upload a recording directly to Blob storage, then register it so the
   * analysis worker is dispatched.
   */
  async uploadVideo(
    file: File,
    sessionTitle: string,
    onProgress?: (progress: VideoUploadProgress) => void
  ): Promise<{ videoId: string; uploadUrl: string }> {
    const token = await getAuthToken()
    if (!token) throw new Error('You must be signed in to upload recordings.')

    const blob = await upload(`recordings/${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: token,
      onUploadProgress: ({ loaded, total, percentage }) => {
        onProgress?.({ loaded, total, percentage: Math.round(percentage) })
      },
    })

    const response = await fetch(`${this.getApiEndpoint()}/videos/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({
        blob_url: blob.url,
        filename: file.name,
        size_mb: Math.round((file.size / (1024 * 1024)) * 10) / 10,
        session_title: sessionTitle,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(err.detail ?? 'Failed to register recording')
    }
    const data = await response.json()
    return { videoId: data.video_id, uploadUrl: blob.url }
  }

  /**
   * Get video processing status
   */
  async getVideoAnalysis(videoId: string): Promise<VideoAnalysisResult> {
    const response = await fetch(`${this.getApiEndpoint()}/videos/${videoId}/status`, {
      headers: await getAuthHeaders(),
    })

    if (!response.ok) {
      throw new Error('Failed to fetch video status')
    }

    const job: LocalJobStatus = await response.json()
    return mapToVideoAnalysisResult(job)
  }

  /**
   * Poll until processing completes or fails
   */
  async waitForProcessing(
    videoId: string,
    onStatusUpdate?: (status: string) => void
  ): Promise<VideoAnalysisResult> {
    let checks = 0

    while (checks < MAX_PROCESSING_STATUS_CHECKS) {
      const result = await this.getVideoAnalysis(videoId)
      checks += 1

      if (onStatusUpdate) {
        onStatusUpdate(result.processingStatus)
      }

      if (result.processingStatus === 'completed') {
        return result
      }

      if (result.processingStatus === 'failed') {
        throw new Error('Video processing failed')
      }

      await new Promise((resolve) => setTimeout(resolve, PROCESSING_STATUS_INTERVAL_MS))
    }

    throw new Error('Video is still processing. Check the processed recordings list again shortly.')
  }

  /**
   * Upload student photo for face enrollment
   */
  async uploadStudentPhoto(
    studentId: string,
    _studentName: string,
    photoFile: File
  ): Promise<void> {
    const token = await getAuthToken()
    if (!token) throw new Error('You must be signed in to enroll photos.')

    const blob = await upload(`photos/${studentId}-${photoFile.name}`, photoFile, {
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: token,
    })

    const response = await fetch(
      `${this.getApiEndpoint()}/students/records/${encodeURIComponent(studentId)}/photo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ blob_url: blob.url }),
      }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(err.detail ?? 'Failed to register student photo')
    }
  }

  /**
   * Get all processed videos
   */
  async getAllVideos(): Promise<VideoAnalysisResult[]> {
    const response = await fetch(`${this.getApiEndpoint()}/videos`, {
      headers: await getAuthHeaders(),
    })

    if (!response.ok) {
      throw new Error('Failed to fetch videos')
    }

    const jobs: LocalJobStatus[] = await response.json()
    return jobs.map(mapToVideoAnalysisResult)
  }

  /**
   * Get all enrolled students
   */
  async getEnrolledStudents(): Promise<{ studentId: string; name: string; photos: number }[]> {
    const response = await fetch(`${this.getApiEndpoint()}/students/enrolled`, {
      headers: await getAuthHeaders(),
    })

    if (!response.ok) {
      throw new Error('Failed to fetch enrolled students')
    }

    const data = await response.json()
    return data.map((s: { student_id: string; name: string; photos: number }) => ({
      studentId: s.student_id,
      name: s.name,
      photos: s.photos,
    }))
  }
}

export const videoService = new VideoService()
