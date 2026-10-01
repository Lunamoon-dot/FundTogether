export type TransactionState =
  | 'idle'
  | 'wallet_requested'
  | 'user_rejected'
  | 'submitted'
  | 'included_success'
  | 'included_reverted'
  | 'confirmed'
  | 'indexed'
