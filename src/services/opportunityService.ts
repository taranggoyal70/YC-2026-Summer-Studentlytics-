import { requireApiEndpoint } from '../config/api'
import { getAuthHeaders } from './authToken'

export interface Opportunity {
  id: string
  title: string
  company: string
  type: 'Job shadows' | 'Micro-internships' | 'Networking' | 'Mentorship' | 'Hackathons'
  tags: string[]
  location: string
  pay?: string
  duration?: string
  spots?: number
  students?: number
  deadline?: string
  status?: 'New' | 'Closes Soon'
  isPaid?: boolean
  description?: string
  created_at?: string
  updated_at?: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const apiUrl = requireApiEndpoint()
  const authHeaders = await getAuthHeaders()
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? `Request failed with status ${response.status}`)
  }

  return response.json()
}

export const opportunityService = {
  list(): Promise<Opportunity[]> {
    return request('/opportunities')
  },

  create(opportunity: Omit<Opportunity, 'id'>): Promise<Opportunity> {
    return request('/opportunities', {
      method: 'POST',
      body: JSON.stringify(opportunity),
    })
  },

  update(id: string, opportunity: Partial<Opportunity>): Promise<Opportunity> {
    return request(`/opportunities/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(opportunity),
    })
  },

  remove(id: string): Promise<{ deleted: string }> {
    return request(`/opportunities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
