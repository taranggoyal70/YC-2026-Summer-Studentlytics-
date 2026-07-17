type TokenProvider = () => Promise<string | null>

let tokenProvider: TokenProvider | null = null

export function setAuthTokenProvider(provider: TokenProvider | null) {
  tokenProvider = provider
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!tokenProvider) return {}

  const token = await tokenProvider()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
