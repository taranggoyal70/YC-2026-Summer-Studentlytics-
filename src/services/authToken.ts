type TokenProvider = () => Promise<string | null>

let tokenProvider: TokenProvider | null = null
let authReady = false
let readyResolvers: (() => void)[] = []

export function setAuthTokenProvider(provider: TokenProvider | null) {
  tokenProvider = provider
}

/** Called once Clerk has loaded (signed in or not) so early page fetches
 * wait for a real token instead of firing unauthenticated. */
export function markAuthReady() {
  authReady = true
  readyResolvers.forEach((resolve) => resolve())
  readyResolvers = []
}

function waitForAuthReady(timeoutMs = 8000): Promise<void> {
  if (authReady) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    readyResolvers.push(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

export async function getAuthToken(): Promise<string | null> {
  await waitForAuthReady()
  if (!tokenProvider) return null
  return tokenProvider()
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
