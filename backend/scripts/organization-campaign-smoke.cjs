// Local HTTP/PostgreSQL checks. Creates two accounts and removes only this run's rows.
require("dotenv").config({ quiet: true });
process.env.LOG_LEVEL = "silent";
require("reflect-metadata");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { NestFactory } = require("@nestjs/core");
const { Pool } = require("pg");
const { AppModule } = require("../dist/src/app.module");
const { DRIZZLE_DB } = require("../dist/src/database/database.constants");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const emails = [1, 2].map((id) => `org-campaign-${randomUUID()}-${id}@example.invalid`);
  const password = randomBytes(24).toString("base64url");
  const app = await NestFactory.create(AppModule, { logger: false });
  let checks = 0;
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    async function request(path, cookie, expected = 200, method = "GET", body) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(response.status, expected, `${method} ${path}: unexpected status`);
      checks++;
      return {
        data: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    }
    const owner = await request("/auth/register", null, 201, "POST", { email: emails[0], password });
    const outsider = await request("/auth/register", null, 201, "POST", { email: emails[1], password });
    const organization = (await request("/organizations", owner.cookie, 201, "POST", {
      name: "Local smoke organization", description: "Temporary verification profile.",
    })).data;
    assert.equal(organization.role, "OWNER");
    const route = `/organizations/${organization.id}/campaigns`;
    await request(route, null, 401);
    await request(route, outsider.cookie, 403);
    assert.deepEqual((await request(route, owner.cookie)).data, []);
    const input = {
      title: "Local campaign", description: "Temporary planning draft.",
      milestones: [1, 2].map((id) => ({
        title: `Milestone ${id}`, description: `Plan ${id}`,
        acceptanceCriteria: [{ criterionId: `criterion-${id}`, description: `Outcome ${id}` }],
      })),
    };
    await request(route, outsider.cookie, 403, "POST", input);
    await request(route, owner.cookie, 400, "POST", { ...input, createdByUserId: outsider.data.userId });
    const created = (await request(route, owner.cookie, 201, "POST", input)).data;
    assert.equal(created.organizationId, organization.id);
    assert.equal(created.createdByUserId, owner.data.userId);
    assert.equal(created.revision, 1);
    assert.deepEqual(created.milestones.map((item) => item.milestoneIndex), [0, 1]);
    assert.deepEqual((await request("/campaigns", owner.cookie)).data, []);
    assert.equal((await request(route, owner.cookie)).data.length, 1);
    const detailRoute = `/campaigns/${created.id}`;
    await request(detailRoute, outsider.cookie, 403);
    await request(`${detailRoute}/milestones/0/evidence-draft`, outsider.cookie, 403);
    const before = (await request(detailRoute, owner.cookie)).data;
    const update = {
      title: "Updated local campaign", description: input.description, expectedRevision: before.revision,
      milestones: before.milestones.map((item) => ({
        id: item.id, title: item.title, description: item.description, acceptanceCriteria: item.acceptanceCriteria,
      })),
    };
    await request(detailRoute, outsider.cookie, 403, "PATCH", update);
    const saved = (await request(detailRoute, owner.cookie, 200, "PATCH", update)).data;
    assert.equal(saved.revision, 2);
    assert.equal(saved.organizationId, organization.id);
    assert.deepEqual(saved.milestones.map((item) => item.id), before.milestones.map((item) => item.id));
    const stale = (await request(detailRoute, owner.cookie, 409, "PATCH", { ...update, title: "Stale tab" })).data;
    assert.equal(stale.code, "CAMPAIGN_NOT_EDITABLE_OR_STALE");
    const reloaded = (await request(detailRoute, owner.cookie)).data;
    assert.equal(reloaded.title, update.title);
    assert.equal(reloaded.revision, 2);
    // Restart login verifies persisted state is independent of a frontend cache.
    const relogin = await request("/auth/login", null, 200, "POST", { email: emails[0], password });
    assert.equal((await request(detailRoute, relogin.cookie)).data.title, update.title);
    // Creator audit identity must not bypass a removed organization membership.
    await pool.query("DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2", [organization.id, owner.data.userId]);
    await request(detailRoute, relogin.cookie, 403);
    await request(detailRoute, relogin.cookie, 403, "PATCH", { ...update, expectedRevision: 2 });
    console.log(`Organization campaign smoke passed: ${checks} HTTP checks; ownership, reload, milestone IDs and stale revision verified.`);
  } finally {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM campaign_evidence_drafts WHERE campaign_metadata_id IN (SELECT id FROM campaign_metadata WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1)))", [emails]);
      await client.query("DELETE FROM campaign_milestone_drafts WHERE campaign_metadata_id IN (SELECT id FROM campaign_metadata WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1)))", [emails]);
      await client.query("DELETE FROM campaign_metadata WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1))", [emails]);
      await client.query("DELETE FROM organization_members WHERE organization_id IN (SELECT id FROM organizations WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1)))", [emails]);
      await client.query("DELETE FROM organizations WHERE created_by_user_id IN (SELECT id FROM users WHERE email = ANY($1))", [emails]);
      await client.query("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [emails]);
      await client.query("DELETE FROM users WHERE email = ANY($1)", [emails]);
      await client.query("COMMIT");
      console.log("Temporary organization/campaign/accounts removed.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
      await app.close();
      await app.get(DRIZZLE_DB).$client.end();
    }
  }
}

main().catch((error) => {
  console.error(error.name, error.message);
  process.exitCode = 1;
});
