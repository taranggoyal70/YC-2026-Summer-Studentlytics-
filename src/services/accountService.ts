import { requireApiEndpoint } from '../config/api'
import { getAuthHeaders } from './authToken'

async function accountRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const apiUrl = requireApiEndpoint()
  const authHeaders = await getAuthHeaders()
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail ?? 'Request failed')
  }

  return response.json()
}

export async function exportMyData(): Promise<Record<string, unknown>> {
  return accountRequest('/me/export')
}

export async function deleteMyAccountData(): Promise<{ deleted: true }> {
  return accountRequest('/me', { method: 'DELETE' })
}
