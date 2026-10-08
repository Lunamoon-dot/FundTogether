// A timeout cannot cancel an extension request. Keep its lock until it settles.
const pendingRequests = new Set<string>()

export function assertWalletRequestAvailable(connectorUid: string) {
  if (pendingRequests.has(connectorUid))
    throw new Error('Ví còn một yêu cầu xác nhận chưa xử lý. Mở extension để xác nhận hoặc từ chối yêu cầu cũ trước khi thử lại.')
}

export async function requestWalletConfirmation<T>({ connectorUid, request, onResult, timeoutMs = 90_000, signal, timeoutMessage }: {
  connectorUid: string
  request: () => Promise<T>
  onResult?: (result: T, late: boolean) => void
  timeoutMs?: number
  signal?: AbortSignal
  timeoutMessage?: string
}) {
  signal?.throwIfAborted()
  assertWalletRequestAvailable(connectorUid)
  pendingRequests.add(connectorUid)
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  const result = Promise.resolve().then(() => { signal?.throwIfAborted(); return request() }).then(value => {
    onResult?.(value, expired)
    return value
  }).finally(() => pendingRequests.delete(connectorUid))
  try {
    return await Promise.race([
      result,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true
          reject(new Error(timeoutMessage ?? 'Ví không phản hồi trong thời gian chờ. Mở extension để xử lý yêu cầu cũ. Nếu ví gửi giao dịch muộn, hash sẽ được giữ để đối chiếu; chưa thể gửi yêu cầu ký khác khi yêu cầu cũ còn chờ. Nếu extension đã bị crash, mở lại extension và tải lại trang trước khi đối chiếu.'))
        }, timeoutMs)
        if (signal) {
          abort = () => { expired = true; reject(signal.reason) }
          signal.addEventListener('abort', abort, { once: true })
          if (signal.aborted) abort()
        }
      }),
    ])
  } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort) }
}
