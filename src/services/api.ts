import { requireApiEndpoint } from '../config/api'
import { getAuthHeaders } from './authToken'

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

export async function getStudent(recordId: string): Promise<any> {
  return request(`/students/records/${encodeURIComponent(recordId)}`)
}

export async function getAllStudents(): Promise<any[]> {
  return request('/students')
}

export async function addStudent(student: any): Promise<any> {
  return request('/students', {
    method: 'POST',
    body: JSON.stringify(student),
  })
}

export async function updateStudent(recordId: string, student: any): Promise<any> {
  return request(`/students/records/${encodeURIComponent(recordId)}`, {
    method: 'PUT',
    body: JSON.stringify(student),
  })
}

export async function deleteStudent(recordId: string): Promise<{ deleted: string }> {
  return request(`/students/records/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
  })
}
