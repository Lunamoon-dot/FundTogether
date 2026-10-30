import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const server = await createServer({ mode: 'fundtogether', server: { middlewareMode: true, ws: false }, logLevel: 'error' })
after(async () => { await server.close() })

const flow = await server.ssrLoadModule('/src/features/campaigns/vnext/vnext-funding-flow.ts')
const root = path.resolve(import.meta.dirname, '..')

const eligibility = (overrides = {}) => flow.vnextContributionEligibility({
  amount: 25_500_000n,
  walletConnected: true,
  correctChain: true,
  fundingState: 1,
  chainTimestamp: 99n,
  fundingDeadline: 100n,
  walletBalance: 100_000_000n,
  remaining: 75_000_000n,
  rpcReady: true,
  transactionPending: false,
  ...overrides,
})

test('converts a human MockUSDC amount with manifest decimals without rounding', () => {
  assert.deepEqual(flow.parseVNextContributionAmount('25.50', 6), { amount: 25_500_000n })
  assert.equal(flow.displayVNextFundingAmount(25_500_000n, 6), '25.5 MockUSDC')
})

test('rejects empty, zero, negative, malformed and over-precision amounts', () => {
  assert.match(flow.parseVNextContributionAmount('', 6).error, /Nhập số tiền/)
  assert.match(flow.parseVNextContributionAmount('0', 6).error, /lớn hơn 0/)
  assert.match(flow.parseVNextContributionAmount('-1', 6).error, /âm/)
  assert.match(flow.parseVNextContributionAmount('ten', 6).error, /định dạng/)
  assert.match(flow.parseVNextContributionAmount('1.0000001', 6).error, /6 chữ số/)
})

test('blocks a contribution above the connected wallet balance', () => {
  const result = eligibility({ walletBalance: 25_499_999n })
  assert.equal(result.ready, false)
  assert.match(result.reason, /số dư/i)
})

test('requires exact approval when allowance is insufficient', () => {
  assert.equal(flow.vnextContributionApprovalRequired(25_499_999n, 25_500_000n), true)
})

test('does not require another approval when allowance is sufficient', () => {
  assert.equal(flow.vnextContributionApprovalRequired(25_500_000n, 25_500_000n), false)
  assert.equal(flow.vnextContributionApprovalRequired(50_000_000n, 25_500_000n), false)
})

test('blocks a contribution above the remaining campaign funding', () => {
  const result = eligibility({ remaining: 25_499_999n })
  assert.equal(result.ready, false)
  assert.match(result.reason, /còn thiếu/)
})

test('blocks funding at the canonical deadline', () => {
  const result = eligibility({ chainTimestamp: 100n })
  assert.equal(result.ready, false)
  assert.match(result.reason, /đã đóng/)
})

test('blocks a disconnected wallet, wrong chain and non-funding contract state', () => {
  assert.match(eligibility({ walletConnected: false }).reason, /Kết nối ví/)
  assert.match(eligibility({ correctChain: false }).reason, /chain 31339/)
  assert.match(eligibility({ fundingState: 3 }).reason, /không còn ở trạng thái FUNDING/)
})

test('receipt confirmation remains pending until the expected canonical contribution is indexed', () => {
  assert.equal(flow.vnextContributionLifecycle('receipt_confirmed'), 'RECEIPT_CONFIRMED')
  assert.equal(flow.vnextCanonicalContributionIndexed([], {
    campaignId: '7', contributor: '0x00000000000000000000000000000000000000a1', amount: 25_500_000n,
  }), false)
  assert.equal(flow.vnextContributionLifecycle('indexing'), 'INDEXING')
})

test('matches only the canonical contribution for the transaction campaign, contributor and amount', () => {
  const expected = {
    campaignId: '7', contributor: '0x00000000000000000000000000000000000000a1', amount: 25_500_000n,
  }
  const wrongCampaign = [{ eventName: 'ContributionReceived', args: { campaignId: '8', backer: expected.contributor, amount: '25500000' } }]
  const canonical = [{ eventName: 'ContributionReceived', args: { campaignId: '7', backer: expected.contributor.toUpperCase(), amount: '25500000' } }]

  assert.equal(flow.vnextCanonicalContributionIndexed(wrongCampaign, expected), false)
  assert.equal(flow.vnextCanonicalContributionIndexed(canonical, expected), true)
  assert.equal(flow.vnextContributionLifecycle('indexed'), 'CONTRIBUTION_CONFIRMED')
  assert.deepEqual(flow.vnextFundingProgress(25_500_000n, 100_000_000n), {
    remaining: 74_500_000n,
    percentageHundredths: 2_550n,
    percentageLabel: '25.50%',
  })
})

test('blocks duplicate sends while a contribution transaction is pending', () => {
  const result = eligibility({ transactionPending: true })
  assert.equal(result.ready, false)
  assert.match(result.reason, /đang xử lý/)
})

test('campaign page owns one focused funding checkout and the action panel has no duplicate contribution buttons', () => {
  const page = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextProtocolPage.tsx'), 'utf8')
  const checkout = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextFundingCheckout.tsx'), 'utf8')
  const actionPanel = fs.readFileSync(path.join(root, 'src/features/campaigns/vnext/VNextActionPanel.tsx'), 'utf8')

  assert.match(page, /VNextFundingCheckout/)
  assert.match(checkout, /parseUnits|parseVNextContributionAmount/)
  assert.match(checkout, /formatUnits|displayVNextFundingAmount/)
  assert.match(checkout, /allowance/)
  assert.match(checkout, /balanceOf/)
  assert.match(checkout, /contributionOf/)
  assert.match(checkout, /simulateContract/)
  assert.match(checkout, /ContributionReceived/)
  assert.match(checkout, /deployment\.tokenDecimals/)
  assert.doesNotMatch(checkout, /2n \*\* 256n|MaxUint256|unlimited/i)
  assert.doesNotMatch(actionPanel, /functionName:\s*'contribute'|Approve MockUSDC|vnext-contribution-amount/)
})
