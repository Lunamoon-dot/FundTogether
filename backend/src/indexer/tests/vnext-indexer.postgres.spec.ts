import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../database/schema";
import { VNextIndexerService } from "../vnext-indexer.service";

const root = resolve(__dirname, "../../../..");
const hash = (letter: string) => `0x${letter.repeat(64)}`;

function readDatabaseUrl() {
  const configured = process.env.DATABASE_URL;
  if (configured) return configured;
  const envFile = resolve(root, ".local/fundtogether/backend.env");
  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find(value => value.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is not configured for the PostgreSQL indexer test");
  return line.slice("DATABASE_URL=".length);
}

describe("VNext indexer persistent transaction boundary", () => {
  jest.setTimeout(30000);
  const databaseName = `fundtogether_vnext_crash_${process.pid}`;
  let admin: Client;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    const base = new URL(readDatabaseUrl());
    const adminUrl = new URL(base);
    adminUrl.pathname = "/postgres";
    admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    const target = new URL(base);
    target.pathname = `/${databaseName}`;
    const { migrateCampaignDatabase } = require("../../../scripts/campaigns/migrate-isolated.cjs");
    await migrateCampaignDatabase(root, {
      databaseUrl: target.toString(),
      expectedDatabaseName: databaseName,
    });
    pool = new Pool({ connectionString: target.toString() });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin?.end();
  });

  it("rolls back event, projection and checkpoint together before replay", async () => {
    const indexer = new VNextIndexerService(db as any, null);
    const streamId = "vnext:31339:0xescrow:0xgenesis";
    const log = {
      transactionHash: hash("a"),
      logIndex: 0,
      blockHash: hash("b"),
      blockNumber: 12n,
    };
    const decoded = {
      eventName: "CampaignCreated",
      args: {
        campaignId: 7n,
        creator: "0x0000000000000000000000000000000000000001",
        payoutWallet: "0x0000000000000000000000000000000000000002",
        commitmentHash: hash("c"),
        goal: 100000000n,
        fundingDeadline: 1000n,
        publicationEvidenceHash: hash("d"),
        publicationReviewCaseId: hash("e"),
        policyVersion: 2n,
      },
    };
    const original = (indexer as any).applyPersistentProjection.bind(indexer);
    let crash = true;
    (indexer as any).applyPersistentProjection = async (...args: unknown[]) => {
      await original(...args);
      if (crash) throw new Error("simulated persistent projection crash");
    };

    await expect((indexer as any).persistEvent(streamId, log, decoded))
      .rejects.toThrow("simulated persistent projection crash");
    expect(await db.select().from(schema.vnextChainEvents)).toHaveLength(0);
    expect(await db.select().from(schema.vnextCampaignProjections)).toHaveLength(0);
    expect(await db.select().from(schema.indexerStreams)).toHaveLength(0);

    crash = false;
    (indexer as any).applyPersistentProjection = original;
    await expect((indexer as any).persistEvent(streamId, log, decoded)).resolves.toBe(true);
    await expect((indexer as any).persistEvent(streamId, log, decoded)).resolves.toBe(false);

    const events = await db.select().from(schema.vnextChainEvents);
    const campaigns = await db.select().from(schema.vnextCampaignProjections);
    const [stream] = await db.select().from(schema.indexerStreams)
      .where(eq(schema.indexerStreams.streamId, streamId));
    expect(events).toHaveLength(1);
    expect(campaigns).toHaveLength(1);
    expect(stream).toMatchObject({ lastBlock: "12", lastBlockHash: hash("b"), status: "synced" });
  });
});
