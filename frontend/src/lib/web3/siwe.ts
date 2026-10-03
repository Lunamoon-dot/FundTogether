export function createSiweMessage(input: {
  address: string
  chainId: number
  nonce: string
  domain: string
  uri: string
  statement?: string
}) {
  return [
    `${new URL(input.uri).protocol}//${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    '',
    input.statement ?? 'Sign in to FundTogether to manage your campaign drafts.',
    '',
    `URI: ${input.uri}`,
    'Version: 1',
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n')
}
