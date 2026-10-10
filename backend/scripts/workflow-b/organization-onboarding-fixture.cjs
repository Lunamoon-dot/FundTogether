const { pdf } = require('./format-fixtures.cjs');
const profile = { kind: 'VOLUNTEER_GROUP', legalName: 'SYNTHETIC onboarding group', registrationNumber: '', address: 'Controlled local fixture',
  activityScope: 'Gift pilot only', representativeName: 'Synthetic representative', representativeRole: 'Organizer',
  authorityBasis: 'Controlled appointment document', identitySource: 'Synthetic registry', activityEvidence: 'Synthetic local pilot', contact: 'fixture@workflow-b.invalid' };
const checks = { identity: true, representation: true, activity: true, contact: true };
const documentBytes = () => pdf('SYNTHETIC organization authority - not a real registration document');
async function approveHttp(request, organizer, staff, orgId, verification, uploadedIds = []) {
  let row = (await request(organizer, 'POST', `/v1/advance/organizations/${orgId}/verification-requests`, {}, 201)).data;
  row = (await request(organizer, 'PATCH', `/v1/advance/verification-requests/${row.id}`, { expectedRevision: row.revision,
    content: { profile, documentIds: row.content.documentIds, responseToReview: '' } })).data;
  const form = new FormData(); form.set('kind', 'IDENTITY'); form.set('expectedRevision', String(row.revision));
  form.set('file', new Blob([documentBytes()], { type: 'application/pdf' }), 'synthetic-organization.pdf');
  row = (await request(organizer, 'POST', `/v1/advance/verification-requests/${row.id}/files`, form, 201)).data;
  uploadedIds.push(...row.documents.map(d => d.id));
  row = (await request(organizer, 'POST', `/v1/advance/verification-requests/${row.id}/submit`, { expectedRevision: row.revision, declaration: true }, 201)).data;
  return (await request(staff, 'POST', `/v1/advance/internal/verification-requests/${row.id}/decisions`, { expectedRevision: row.revision,
    decision: 'APPROVE', checks, reviewNote: 'Controlled synthetic registry checked', verification }, 201)).data;
}
async function approveService(requests, verificationService, orgId, ownerId, adminId, verification) {
  let row = await requests.create(orgId, ownerId);
  row = await requests.save(row.id, ownerId, { expectedRevision: row.revision, content: { profile, documentIds: row.content.documentIds, responseToReview: '' } });
  row = await requests.upload(row.id, ownerId, row.revision, 'IDENTITY', { buffer: documentBytes(), mimetype: 'application/pdf', originalname: 'synthetic-organization.pdf' });
  row = await requests.submit(row.id, ownerId, row.revision);
  row = await requests.decide(row.id, adminId, { expectedRevision: row.revision, decision: 'APPROVE', checks, reviewNote: 'Controlled synthetic registry checked', verification });
  return (await verificationService.history(orgId, adminId)).find(record => record.id === row.verificationRecordId);
}
module.exports = { profile, checks, documentBytes, approveHttp, approveService };
