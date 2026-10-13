// Transactions may still be broadcast after a timeout; retain their lock.
// Discarded authentication signatures can release theirs without moving funds.
const pendingRequests = new Map<string, symbol>()

export function assertWalletRequestAvailable(connectorUid: string) {
  if (pendingRequests.has(connectorUid))
    throw new Error('Ví còn một yêu cầu xác nhận chưa xử lý. Mở extension để xác nhận hoặc từ chối yêu cầu cũ trước khi thử lại.')
}

export function releaseWalletRequest(connectorUid: string) {
  pendingRequests.delete(connectorUid)
}

export async function requestWalletConfirmation<T>({ connectorUid, request, onResult, timeoutMs = 90_000, signal, timeoutMessage, releaseOnAbandon = false }: {
  connectorUid: string
  request: () => Promise<T>
  onResult?: (result: T, late: boolean) => void
  timeoutMs?: number
  signal?: AbortSignal
  timeoutMessage?: string
  releaseOnAbandon?: boolean
}) {
  signal?.throwIfAborted()
  assertWalletRequestAvailable(connectorUid)
  const requestId = Symbol()
  pendingRequests.set(connectorUid, requestId)
  function release() {
    // An older request settling must not unlock a newer request for this wallet.
    if (pendingRequests.get(connectorUid) === requestId) pendingRequests.delete(connectorUid)
  }
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  const result = Promise.resolve().then(() => { signal?.throwIfAborted(); return request() }).then(value => {
    onResult?.(value, expired)
    return value
  }).finally(release)
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
  } finally {
    clearTimeout(timer)
    if (abort) signal?.removeEventListener('abort', abort)
    if (releaseOnAbandon) release()
  }
}
