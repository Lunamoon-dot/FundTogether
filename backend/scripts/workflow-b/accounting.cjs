// Hypothetical accounting traces for specification review, not a transaction engine.
function units(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new Error('positive base unit string required');
  return BigInt(value);
}

function traceCampaign({ budgets, donors, actions }) {
  const fail = (message) => { throw new Error(`invalid trace: ${message}`); };
  if (!budgets.length) fail('budgets required');
  const stages = budgets.map((amount) => ({ budget: units(amount), advanced: false, accepted: false, returned: 0n }));
  const contributions = new Map();
  for (const { wallet, amount } of donors) {
    if (!wallet || contributions.has(wallet)) fail('unique donor wallets required');
    contributions.set(wallet, units(amount));
  }
  const goal = stages.reduce((sum, stage) => sum + stage.budget, 0n);
  const contributed = [...contributions.values()].reduce((sum, amount) => sum + amount, 0n);
  if (contributed > goal) fail('contributions exceed goal');
  let advanced = 0n, returned = 0n, refunded = 0n, custody = contributed;
  let basePool = null, supplementPool = 0n;
  const baseClaims = new Set(), supplementPaid = new Map(), rows = [];
  const entitlement = (wallet, pool) => contributed === 0n ? 0n : contributions.get(wallet) * pool / contributed;
  for (const action of actions) {
    let amount = 0n;
    const stage = stages[action.stage];
    switch (action.kind) {
      case 'note':
        break; // Descriptive evidence annotations carry no financial effect.
      case 'advance':
        if (basePool !== null || contributed !== goal || !stage || stage.advanced ||
          (action.stage > 0 && !stages[action.stage - 1].accepted)) fail('advance order/funding/snapshot');
        amount = stage.budget;
        stage.advanced = true;
        advanced += amount;
        custody -= amount;
        break;
      case 'accept':
        if (basePool !== null || !stage?.advanced || stage.accepted) fail('accept requires an unaccepted advance');
        stage.accepted = true;
        break;
      case 'return':
        amount = units(action.amount);
        if (!stage?.advanced || stage.returned + amount > stage.budget) fail('return exceeds actual stage advance');
        stage.returned += amount;
        returned += amount;
        custody += amount;
        if (basePool !== null) supplementPool += amount;
        break;
      case 'snapshot':
        if (basePool !== null) fail('snapshot already exists');
        basePool = custody;
        break;
      case 'refund': {
        if (basePool === null || !contributions.has(action.wallet)) fail('refund requires snapshot and donor');
        const base = baseClaims.has(action.wallet) ? 0n : entitlement(action.wallet, basePool);
        const supplemental = entitlement(action.wallet, supplementPool);
        const previouslyPaid = supplementPaid.get(action.wallet) ?? 0n;
        amount = base + supplemental - previouslyPaid;
        if (baseClaims.has(action.wallet) && amount === 0n) fail('no new entitlement');
        baseClaims.add(action.wallet);
        supplementPaid.set(action.wallet, supplemental);
        refunded += amount;
        custody -= amount;
        break;
      }
      default: fail('unknown action');
    }
    if (custody < 0n || contributed + returned !== advanced + refunded + custody) fail('custody conservation');
    rows.push({ ...action, amount: String(amount), contributed: String(contributed), advanced: String(advanced),
      returned: String(returned), refunded: String(refunded), custody: String(custody) });
  }
  let unclaimed = null, dust = null;
  if (basePool !== null) {
    let totalEntitlements = 0n;
    for (const wallet of contributions.keys()) totalEntitlements += entitlement(wallet, basePool) + entitlement(wallet, supplementPool);
    unclaimed = String(totalEntitlements - refunded);
    dust = String(basePool + supplementPool - totalEntitlements);
  }
  return { contributed: String(contributed), advanced: String(advanced), returned: String(returned), refunded: String(refunded),
    custody: String(custody), basePool: basePool === null ? null : String(basePool), supplementPool: String(supplementPool), unclaimed, dust, rows };
}
module.exports = { traceCampaign };
