import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const backendRoot = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(backendRoot, "src");

const requiredPaths = [
  "app.module.ts",
  "modules/campaigns/controllers/campaign.controller.ts",
  "modules/campaigns/services/campaign.service.ts",
  "modules/campaigns/workflow/campaign.service.ts",
  "modules/pledges/workflow/pledge.service.ts",
  "modules/review/services/review-conversation.service.ts",
  "modules/delivery/services/delivery.service.ts",
  "indexer/campaign-indexer.service.ts",
  "indexer/historical-campaign-indexer.service.ts",
  "health/health.controller.ts",
];

test("active backend code is grouped by domain", () => {
  for (const relativePath of requiredPaths) {
    assert.ok(existsSync(resolve(sourceRoot, relativePath)), `Missing ${relativePath}`);
  }

  assert.equal(existsSync(resolve(sourceRoot, "reward")), false);
  assert.equal(existsSync(resolve(sourceRoot, "modules/campaigns")), true);
});

test("public campaign identifiers use the current namespace", () => {
  const files = [
    "modules/campaigns/controllers/campaign.controller.ts",
    "modules/campaigns/controllers/chain.controller.ts",
    "modules/delivery/controllers/delivery.controller.ts",
    "modules/campaigns/workflow/public.controller.ts",
  ];
  const source = files
    .map((relativePath) => readFileSync(resolve(sourceRoot, relativePath), "utf8"))
    .join("\n");

  assert.match(source, /@Controller\(["']v1\/fundtogether\/campaigns/);
  assert.match(source, /(?:Get|Post|Patch)\(["']campaigns\/:id/);
});
