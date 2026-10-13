import axios from 'axios'

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
      return 'Backend phản hồi quá lâu. Tải lại trạng thái trước khi thử lại; yêu cầu ghi dữ liệu có thể đã được xử lý.'
    const data = error.response?.data
    if (data && typeof data === 'object') {
      const issues = (data as { issues?: Array<{ path?: string[]; message?: string }> }).issues
      if (Array.isArray(issues) && issues.length > 0) {
        const details = issues
          .map(i => {
            const field = i.path && i.path.length > 0 ? `${i.path.join('.')}: ` : ''
            return `${field}${i.message ?? ''}`
          })
          .filter(Boolean)
          .join(', ')
        if (details) return details
      }
      const message = (data as { message?: unknown }).message
      if (typeof message === 'string') return message
      if (Array.isArray(message)) return message.join(', ')
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
