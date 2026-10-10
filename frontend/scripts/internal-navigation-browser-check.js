// Isolated browser check with intercepted API; no real account or chain writes.
// eslint-disable-next-line no-unused-expressions -- playwright-cli evaluates this function expression.
async page => {
  let roles = ['USER'];
  await page.route('http://localhost:3001/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!['GET', 'OPTIONS'].includes(request.method())) throw new Error('Unexpected write');
    const body = path === '/auth/session' ? { userId: 'navigation-test', email: 'test@example.invalid', roles, wallets: [] } : { items: [], nextOffset: null };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const results = [];
  for (const selected of [['USER'], ['ADMIN'], ['RESOLVER'], ['ADMIN', 'RESOLVER']]) {
    roles = selected;
    await page.goto('http://localhost:5174/#/account'); await page.reload();
    await page.getByRole('heading', { name: 'Quyền tài khoản', exact: true }).waitFor();
    const links = page.locator('a[href^="#/internal"]');
    const staff = selected.includes('ADMIN') || selected.includes('RESOLVER');
    if (await links.count() !== (staff ? 2 : 0)) throw new Error(`Wrong internal entry count for ${selected}`);
    if (staff) {
      const expected = selected.includes('ADMIN') ? '#/internal/organizations' : '#/internal/campaigns';
      for (const link of await links.all()) if (await link.getAttribute('href') !== expected) throw new Error(`Wrong route for ${selected}`);
    }
    results.push({ roles: selected, status: 'PASS' });
  }
  return { results, mockedAPI: true, realWrites: 0 };
}
