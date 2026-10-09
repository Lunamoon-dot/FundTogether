// New live-format synthetic plans; historical DRAFT datasets are never rewritten.
function giftPlan(count = 1) {
  if (![1, 3].includes(count)) throw new Error('Synthetic G1/G2 stage count required');
  const key = count === 1 ? 'G1' : 'G2';
  return { activityType: 'GIFT_DISTRIBUTION', channel: count === 1 ? 'INSTITUTION' : 'DIRECT',
    checklistVersion: 'gift.v1', title: `Synthetic${key} gift campaign`,
    description: 'Controlled synthetic local pilot; documents and recipients are fictional',
    recipientScope: count === 1 ? 'School receives100 packages; no assertion that students received them'
      : 'Three separate controlled cohorts receive50 packages each',
    eligibilityBasis: 'Controlled synthetic authority/contact registry, checked by staff and resolver',
    fundingDuration: '604800', stages: Array.from({ length: count }, (_, index) => {
      const prefix = `${key}-S${index + 1}`;
      return { title: `Purchase and handover stage${index + 1}`, description: `Deliver to the planned cohort${index + 1}`,
        budgetUnits: count === 1 ? '2200000000' : '1100000000', targetPackages: count === 1 ? 100 : 50,
        goods: 'Each package:2kg rice,1L oil,5 packs noodles',
        tasks: [
          { taskId: 'purchase', description: 'Purchase with traceable payment source', criterionIds: [`${prefix}-C2`] },
          { taskId: 'inventory', description: 'Check quantities and composition', criterionIds: [`${prefix}-C1`] },
          { taskId: 'transport', description: 'Transport to the planned recipient', criterionIds: [`${prefix}-C3`] },
          { taskId: 'handover', description: 'Authorized receipt and account for unused funds', criterionIds: [`${prefix}-C3`, `${prefix}-C4`] }],
        acceptanceCriteria: [
          { criterionId: `${prefix}-C1`, description: 'Full planned number and composition of packages', requiredDocuments: ['REPORT', 'PHOTO'] },
          { criterionId: `${prefix}-C2`, description: 'Invoice and payment reconcile in token base units; organizer funding recorded separately', requiredDocuments: ['INVOICE', 'PAYMENT_PROOF'] },
          { criterionId: `${prefix}-C3`, description: 'Correct recipient scope and independently checked signer authority', requiredDocuments: ['DELIVERY_RECORD'] },
          { criterionId: `${prefix}-C4`, description: 'Campaign spent plus unused equals advance; any unused requires actual return', requiredDocuments: ['REPORT'] }],
      };
    }) };
}
module.exports = { giftPlan };
