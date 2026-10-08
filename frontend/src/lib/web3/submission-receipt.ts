import type { Hash } from 'viem'

export async function waitForSubmissionReceipt(hash: Hash, dependencies: {
  wait: (hash: Hash, onReplaced: (replacement: { reason: string; transaction: { hash: Hash } }) => void) => Promise<{ status: 'success' | 'reverted' }>
  savePending: (hash: Hash, cancelled: boolean) => void
  clearPending: () => void
  cancelled?: boolean
}) {
  let cancelled = dependencies.cancelled ?? false
  const receipt = await dependencies.wait(hash, replacement => {
    cancelled ||= replacement.reason === 'cancelled'
    dependencies.savePending(replacement.transaction.hash, cancelled)
  })
  dependencies.clearPending()
  if (cancelled) throw new Error('Bạn đã hủy giao dịch trong ví. Đối chiếu trạng thái rồi tiếp tục nộp.')
  if (receipt.status !== 'success') throw new Error('Giao dịch bị revert. Bấm tiếp tục để đối chiếu trạng thái và thử lại.')
}
