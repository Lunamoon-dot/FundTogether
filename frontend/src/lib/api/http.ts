import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.MODE === 'workflow-b'
    ? import.meta.env.VITE_WORKFLOW_B_API_URL ?? 'http://localhost:3001'
    : import.meta.env.MODE === 'hed'
      ? import.meta.env.VITE_HED_API_URL ?? 'http://localhost:3002'
    : import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  withCredentials: true,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
  },
})
