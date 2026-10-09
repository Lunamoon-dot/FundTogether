import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_WORKFLOW_B_API_URL ?? 'http://localhost:3001',
  withCredentials: true,
  timeout: 20_000,
})

export async function advanceHttp<T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> {
  const response = await client.request<T>({ ...config, ...options })
  return response.data
}
