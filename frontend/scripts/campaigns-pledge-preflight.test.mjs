import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const preflight = await readFile(new URL('../src/features/campaigns/shared/ui/PledgePreflight.tsx', import.meta.url), 'utf8')
const transaction = await readFile(new URL('../src/features/campaigns/transactions/useTransaction.ts', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/features/campaigns/backer/CampaignActions.tsx', import.meta.url), 'utf8')

test('required read failures fail closed before READY', () => {
  assert.match(preflight, /wallets\.error \|\| balance\.error \|\| allowance\.error/)
  assert.match(preflight, /readiness = 'READ_FAILED'/)
  assert.match(preflight, /const canPledge = readiness === 'READY' && quantity !== null && !transaction && !busy/)
  assert.match(preflight, /chain\.status === 'ON_CHAIN_CONFIRMED' && chain\.snapshot\?\.state === 0/)
  assert.match(preflight, /balance\.data < total/)
  assert.match(preflight, /getBlock\(\{ blockTag: 'latest' \}\)/)
  assert.match(preflight, /fundingExpired = Boolean\(chain\.snapshot\?\.fundingDeadline/)
  assert.match(preflight, /readiness = 'FUNDING_EXPIRED'/)
  assert.match(preflight, /async function submitPledge\(\)/)
  assert.match(preflight, /latest\.timestamp >= BigInt\(chain\.snapshot\.fundingDeadline\)/)
})

test('approval and pledge remain two explicit steps in one journey', () => {
  assert.match(preflight, /Cần approve đủ tổng giá trị · sau đó pledge/)
  assert.match(transaction, /Bước 1\/2 · Xác nhận approve MockUSDC/)
  assert.match(transaction, /Approve MockUSDC đã thành công nhưng pledge chưa được gửi/)
  assert.match(transaction, /clearStoredTransaction\(context\.userId, context\.campaignId, action\)/)
  assert.doesNotMatch(transaction, /clearAllTransactions/)
})

test('pledge maps token balance errors and blocks approval when balance is insufficient', () => {
  assert.match(transaction, /mock-usdc\.abi\.json/)
  assert.match(transaction, /item\.type === 'error'/)
  assert.match(transaction, /0xe450d38c/)
  assert.match(transaction, /functionName: 'balanceOf'/)
  assert.match(transaction, /Số dư MockUSDC không đủ để pledge/)
})

test('pledge flow is hidden after the funding deadline', () => {
  assert.match(page, /state\.state === 0 && state\.price && !fundingExpired/)
  assert.match(page, /transaction\.send\('pledge',[\s\S]*?\.finally\(onRefresh\)/)
})

test('activation preflight rejects a Creator wallet that is a Resolver wallet', () => {
  assert.match(transaction, /functionName === 'approveCampaign' \|\| functionName === 'createCampaign'/)
  assert.match(transaction, /const creatorWallet = functionName === 'approveCampaign' \? String\(args\[0\] \?\? ''\) : actor/)
  assert.match(transaction, /Ví Creator không được trùng ví Resolver của deployment hiện tại/)
})

test('transaction preflight includes linked Resolver wallets', () => {
  assert.match(transaction, /listTransactionWallets/)
  assert.match(preflight, /listTransactionWallets/)
})

test('transaction errors distinguish page connection from the actual wallet chain', () => {
  assert.match(transaction, /Ví chưa được kết nối với trang FundTogether/)
  assert.match(transaction, /Trang chưa nhận được wallet provider/)
  assert.match(transaction, /const walletChainId = await wallet\.getChainId\(\)/)
  assert.match(transaction, /Ví đang ở chain \$\{walletChainId\}/)
})

test('quantity selection allows an existing backer to buy more', () => {
  assert.match(preflight, /quantityInput/)
  assert.match(preflight, /type="number"/)
  assert.match(preflight, /Giảm số lượng gói/)
  assert.match(preflight, /Tăng số lượng gói/)
  assert.match(preflight, /quantity === 1n/)
  assert.doesNotMatch(preflight, /entitlement\?\.access === 'ORPHANED'/)
})
