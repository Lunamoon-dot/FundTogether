// Run with playwright-cli run-code --filename=frontend/scripts/organization-upload-browser-check.js
// Isolated browser and intercepted API only; no real account or chain writes.
// eslint-disable-next-line no-unused-expressions -- playwright-cli evaluates this function expression.
async page => {
  const wallet = { address: '0x1111111111111111111111111111111111111111', chainId: 31338 };
  const profile = { kind: 'VOLUNTEER_GROUP', legalName: 'TEST pending upload', registrationNumber: '', address: 'Test', activityScope: 'Test',
    representativeName: 'Test', representativeRole: 'Test', authorityBasis: 'Test', identitySource: 'Test', activityEvidence: 'Test', contact: 'Test' };
  let uploaded = false, submitted = false, failUpload = true, revision = 1;
  let content = { profile, documentIds: ['old'], responseToReview: '' };
  const request = () => ({ id: 'req', organizationId: 'org', status: submitted ? 'UNDER_REVIEW' : 'DRAFT', revision,
    content,
    documents: [{ id: 'old', originalName: 'existing.pdf', byteSize: 30 }, ...(uploaded ? [{ id: 'new', originalName: 'new.pdf', byteSize: 30 }] : [])],
    missingItems: [], submittedAt: submitted ? '2026-10-11T00:00:00Z' : null });
  await page.route('http://localhost:3001/**', async route => {
    const r = route.request(), path = new URL(r.url()).pathname;
    let status = 200, body;
    if (path === '/auth/session') body = { userId: 'owner', email: 'synthetic@example.invalid', roles: ['USER'], wallets: [wallet] };
    else if (path === '/organizations') body = [{ id: 'org', name: profile.legalName, createdByUserId: 'owner', role: 'OWNER', createdAt: '2026-10-11T00:00:00Z', representativeWallet: wallet }];
    else if (path === '/v1/advance/organizations/org/verification-requests') body = { organization: { id: 'org', name: profile.legalName }, requests: [request()], audit: [], isOwner: true, verification: { status: 'UNVERIFIED' } };
    else if (path === '/v1/advance/verification-requests/req' && r.method() === 'PATCH') { content = r.postDataJSON().content; revision++; body = request(); }
    else if (path === '/v1/advance/verification-requests/req/files') {
      if (!r.postData().includes('REPRESENTATION')) throw new Error('Document category lost after saving');
      if (failUpload) { status = 503; body = { message: 'Synthetic upload failure' }; }
      else { uploaded = true; revision++; content = { ...content, documentIds: ['old', 'new'] }; body = request(); }
    } else if (path === '/v1/advance/verification-requests/req/submit') { submitted = true; body = request(); }
    else throw new Error(`Unexpected API request: ${r.method()} ${path}`);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://localhost:5174/#/organizations/org'); await page.reload();
  const submit = page.getByRole('button', { name: 'Gửi xác thực', exact: true });
  const declaration = page.getByRole('checkbox', { name: 'Tôi xác nhận thông tin đúng', exact: false });
  await declaration.check();
  if (await submit.isDisabled()) throw new Error('Existing uploaded document should permit submission');
  const picker = page.locator('input[type=file]');
  const file = { name: 'new.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic browser test') };
  await picker.setInputFiles(file);
  if (!await submit.isDisabled()) throw new Error('Selected but unuploaded file can be silently omitted');
  await page.getByText('chưa được tải lên', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Bỏ chọn file', exact: true }).click();
  if (await submit.isDisabled()) throw new Error('Clearing the pending file did not release submission');
  if (await picker.evaluate(el => el.files.length)) throw new Error('File input was not cleared');
  await picker.setInputFiles(file);
  await page.getByLabel('Loại tài liệu', { exact: false }).selectOption('REPRESENTATION');
  await page.getByLabel('Địa chỉ hoạt động', { exact: false }).fill('Edited address');
  await page.getByRole('button', { name: 'Tải tài liệu lên', exact: true }).click();
  await page.getByText('Synthetic upload failure', { exact: false }).waitFor();
  if (!await submit.isDisabled()) throw new Error('Failed upload enabled submission');
  await page.getByText('chưa được tải lên', { exact: false }).waitFor();
  if (await page.getByLabel('Loại tài liệu', { exact: false }).inputValue() !== 'REPRESENTATION') throw new Error('Category reset');
  failUpload = false;
  await page.getByRole('button', { name: 'Tải tài liệu lên', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Giữ new.pdf trong hồ sơ này', exact: true }).waitFor();
  await declaration.check(); await submit.click();
  await page.getByText('Hồ sơ đã khóa trong lúc xét duyệt.', { exact: false }).waitFor();
  if (!uploaded || !submitted) throw new Error('Upload and submission not completed');
  return { status: 'PASS', mockedAPI: true, checks: ['pending file blocks submit', 'clear resets picker', 'save then failed upload retains file and category', 'upload retry then submit'], realWrites: 0 };
}

