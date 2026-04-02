import axios from 'axios'
import type { AxiosInstance } from 'axios'
import router from '@/router'

const client: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Auth is handled entirely via httpOnly cookies set by the server.
// No token is stored or read in JavaScript. The browser sends the
// cookie automatically on every request because withCredentials is true.

// Response interceptor to handle auth and setup errors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      // Session expired or invalid; redirect to login
      router.push('/login')
    } else if (status === 503 && error.response?.data?.setupUrl) {
      // Setup not complete; redirect to setup wizard
      router.push('/setup')
    }
    return Promise.reject(error)
  }
)

export default client
