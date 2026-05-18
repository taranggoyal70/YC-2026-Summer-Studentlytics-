const API_URL = 'http://localhost:8000/api/auth'

export interface User {
  id: number
  email: string
  name: string
  type: 'student' | 'teacher' | 'admin'
  institution?: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface SignupData {
  email: string
  password: string
  fullName: string
  role: string
  institution?: string
}

export interface LoginData {
  email: string
  password: string
  role?: string
}

class AuthService {
  private token: string | null = null

  constructor() {
    // Load token from localStorage on initialization
    this.token = localStorage.getItem('access_token')
  }

  async signup(data: SignupData): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Signup failed')
      }

      const authData: AuthResponse = await response.json()
      
      // Store token and user data
      this.token = authData.access_token
      localStorage.setItem('access_token', authData.access_token)
      localStorage.setItem('user', JSON.stringify(authData.user))
      localStorage.setItem('isAuthenticated', 'true')

      return authData
    } catch (error) {
      console.error('Signup error:', error)
      throw error
    }
  }

  async login(data: LoginData): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Login failed')
      }

      const authData: AuthResponse = await response.json()
      
      // Store token and user data
      this.token = authData.access_token
      localStorage.setItem('access_token', authData.access_token)
      localStorage.setItem('user', JSON.stringify(authData.user))
      localStorage.setItem('isAuthenticated', 'true')

      return authData
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }

  async getCurrentUser(): Promise<User> {
    if (!this.token) {
      throw new Error('No authentication token found')
    }

    try {
      const response = await fetch(`${API_URL}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to get current user')
      }

      const user: User = await response.json()
      localStorage.setItem('user', JSON.stringify(user))
      return user
    } catch (error) {
      console.error('Get current user error:', error)
      this.logout()
      throw error
    }
  }

  logout(): void {
    this.token = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    localStorage.removeItem('isAuthenticated')
  }

  isAuthenticated(): boolean {
    return !!this.token && localStorage.getItem('isAuthenticated') === 'true'
  }

  getToken(): string | null {
    return this.token
  }

  getUser(): User | null {
    const userStr = localStorage.getItem('user')
    if (!userStr) return null
    try {
      return JSON.parse(userStr)
    } catch {
      return null
    }
  }
}

export const authService = new AuthService()
