/* eslint-disable no-unused-expressions -- Playwright CLI evaluates this function. */
async page => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.unrouteAll()
  await page.goto('about:blank')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('http://localhost:5174/#/campaigns/1')
  await page.getByRole('heading', { name: 'SyntheticG1 gift campaign', exact: true }).waitFor()
  await page.getByText('2200 USDC', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: /Tài liệu công khai 1/ }).waitFor()
  if (await page.getByRole('button', { name: 'Đọc bản gốc', exact: true }).count()) throw new Error('Original control exposed publicly')
  await page.screenshot({ path: '.local/workflow-b/ui-live-public.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile overflow')
  if (errors.length) throw new Error(errors.join('\n'))
  const api = await page.evaluate(async () => {
    const response = await fetch('http://localhost:3001/v1/advance/public/campaigns/1')
    const data = await response.json()
    return { status: response.status, campaignId: data.snapshot?.campaignId, custody: data.workflow?.custody, deploymentId: data.snapshot?.context.deploymentId }
  })
  if (api.status !== 200 || api.campaignId !== '1' || api.custody !== '0') throw new Error('Live API differs from displayed seeded campaign')
  return { status: 'PASS', mode: 'REAL_READ_ONLY_BROWSER', api, reactErrors: errors, extensionSigning: false }
}
