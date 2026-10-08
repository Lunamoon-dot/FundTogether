import axios from 'axios'

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
      return 'Backend phản hồi quá lâu. Tải lại trạng thái trước khi thử lại; yêu cầu ghi dữ liệu có thể đã được xử lý.'
    const message = error.response?.data?.message
    if (typeof message === 'string') return message
    if (Array.isArray(message)) return message.join(', ')
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}
