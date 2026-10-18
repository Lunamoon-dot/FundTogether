import type { Address, Hex } from 'viem'
import { requestWalletConfirmation } from './wallet-confirmation.ts'
import { assertWalletConnection } from './wallet-identity.ts'
import type { WalletConnectionIdentity } from './wallet-identity.ts'

export type WalletProofIdentity = WalletConnectionIdentity

export async function requestWalletProof<T extends { chainId: number }>({ expected, current, prepare, challenge, message, sign, onStage, timeoutMs = 90_000, preparationTimeoutMs = 8_000, challengeTimeoutMs = 20_000, signal }: {
  expected: WalletProofIdentity
  current: () => WalletProofIdentity
  prepare?: () => Promise<void>
  challenge: () => Promise<T>
  message: (challenge: T) => string
  sign: (message: string, account: Address) => Promise<Hex>
  onStage?: (stage: 'prepare' | 'challenge' | 'signature') => void
  timeoutMs?: number
  preparationTimeoutMs?: number
  challengeTimeoutMs?: number
  signal?: AbortSignal
}) {
  function checkIdentity() {
    signal?.throwIfAborted()
    assertWalletConnection(expected, current())
  }
  async function waitStep<R>(request: () => Promise<R>, timeout: number, error: string) {
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      return await Promise.race([
        Promise.resolve().then(() => { checkIdentity(); return request() }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(error)), timeout)
          if (signal) {
            abort = () => reject(signal.reason)
            signal.addEventListener('abort', abort, { once: true })
            if (signal.aborted) abort()
          }
        }),
      ])
    } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort) }
  }
  checkIdentity()
  onStage?.('prepare')
  const preparation = prepare
    ? waitStep(prepare, preparationTimeoutMs, 'Không đọc được kết nối ví trong 8 giây. Chưa gửi yêu cầu ký. Ngắt kết nối và chọn đúng ví để thử lại.')
    : Promise.resolve()
  onStage?.('challenge')
  const challengeResponse = waitStep(challenge, challengeTimeoutMs, 'Backend chưa trả thông điệp xác thực. Chưa gửi yêu cầu ký; kiểm tra kết nối API rồi thử lại.')
  const [_, nonce] = await Promise.all([
    preparation,
    challengeResponse,
  ])
  checkIdentity()
  if (nonce.chainId !== expected.chainId) throw new Error(`Chuyển ví sang mạng có chain ID ${nonce.chainId}.`)
  const text = message(nonce)
  const signature = await requestWalletConfirmation({
    connectorUid: expected.connectorUid ?? expected.address!,
    request: () => { onStage?.('signature'); checkIdentity(); return sign(text, expected.address!) },
    timeoutMs,
    signal,
    timeoutMessage: 'Ví chưa trả chữ ký trong thời gian chờ. Yêu cầu cũ có thể vẫn đang treo trong extension; hãy từ chối yêu cầu đó trước khi thử lại hoặc tải lại trang.',
  })
  checkIdentity()
  return { message: text, signature }
}
