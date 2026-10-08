const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dueTimeout } = require("./local-timeout-worker.cjs");

function reader(values) {
  return async (name) => {
    assert.ok(name in values, `Unexpected read ${name}`);
    return values[name];
  };
}
test("funding timeout uses chain timestamp and exact boundary", async () => {
  const read = reader({ fundingDeadlines: 100n });
  assert.equal(await dueTimeout(0n, 2, 99n, read, false), null);
  assert.equal(
    (await dueTimeout(0n, 2, 100n, read, false)).functionName,
    "finalizeFundingFailure",
  );
});
for (const state of [3, 9, 6])
  test(`activation/evidence timeout uses current milestone (${state})`, async () => {
    const read = reader({
      currentMilestoneIndex: 1n,
      activationDeadlines: 100n,
      evidenceDeadlines: 100n,
    });
    assert.equal(await dueTimeout(3n, state, 99n, read, true), null);
    assert.deepEqual((await dueTimeout(3n, state, 100n, read, true)).args, [
      3n,
      1n,
    ]);
  });
test("admission expiry is bound to the current version", async () => {
  const read = reader({
    currentMilestoneIndex: 2n,
    submissionVersion: 3n,
    admissionDeadlines: 100n,
  });
  assert.equal(await dueTimeout(0n, 11, 99n, read, true), null);
  assert.deepEqual((await dueTimeout(0n, 11, 100n, read, true)).args, [
    0n,
    2n,
    3n,
  ]);
});
test("prototype never invents a challenge exit", async () => {
  const read = reader({ currentMilestoneIndex: 0n, submissionVersion: 1n });
  assert.equal(await dueTimeout(0n, 8, 100n, read, false), null);
});
test("MVP case timeout requires deadline and unresolved case", async () => {
  const values = {
    currentMilestoneIndex: 0n,
    submissionVersion: 1n,
    challengeCases: [0, 0, 0, 0, 90n, 100n, 0, 0],
  };
  assert.equal(await dueTimeout(0n, 8, 99n, reader(values), true), null);
  assert.equal(
    (await dueTimeout(0n, 8, 100n, reader(values), true)).functionName,
    "finalizeChallengeTimeout",
  );
  values.challengeCases[6] = 1;
  assert.equal(await dueTimeout(0n, 8, 100n, reader(values), true), null);
});
test("terminal/review states do not authorize settlement or payment by timeout worker", async () => {
  for (const state of [0, 1, 4, 5, 7, 10, 12])
    assert.equal(await dueTimeout(0n, state, 100n, reader({}), true), null);
});
