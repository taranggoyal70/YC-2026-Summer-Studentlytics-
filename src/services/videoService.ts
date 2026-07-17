import { requireApiEndpoint } from '../config/api'
import { getAuthHeaders } from './authToken'

const MAX_PROCESSING_STATUS_CHECKS = 10
const PROCESSING_STATUS_INTERVAL_MS = 8000

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
   * Upload video to local FastAPI and start processing
   */
  async uploadVideo(
    file: File,
    sessionTitle: string,
    onProgress?: (progress: VideoUploadProgress) => void
  ): Promise<{ videoId: string; uploadUrl: string }> {
    const authHeaders = await getAuthHeaders()
    return new Promise((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('session_title', sessionTitle)

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage: Math.round((e.loaded / e.total) * 100),
          })
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText)
          resolve({ videoId: data.video_id, uploadUrl: '' })
        } else {
          reject(new Error(`Upload failed: ${xhr.responseText}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed — is the backend running? (cd backend && uvicorn main:app --reload)'))
      })

      xhr.open('POST', `${this.getApiEndpoint()}/videos/upload`)
      Object.entries(authHeaders).forEach(([key, value]) => xhr.setRequestHeader(key, value))
      xhr.send(formData)
    })
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
    studentName: string,
    photoFile: File
  ): Promise<void> {
    const formData = new FormData()
    formData.append('file', photoFile)
    formData.append('student_id', studentId)
    formData.append('student_name', studentName)

    const response = await fetch(`${this.getApiEndpoint()}/students/photo`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: formData,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(err.detail ?? 'Failed to upload student photo')
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
