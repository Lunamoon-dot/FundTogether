import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  withCredentials: true,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
  },
})
