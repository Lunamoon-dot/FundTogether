import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_REWARD_API_URL ?? 'http://localhost:3002',
  withCredentials: true,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
  },
})
