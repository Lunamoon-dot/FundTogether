import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AuthGuard } from "../../auth/auth.guard";
import { PayoutController } from "../controllers/payout.controller";
import { PayoutService } from "../services/payout.service";

describe("PayoutController", () => {
  let app: INestApplication;
  const payout = {
    create: jest.fn(async () => ({ requestHash: `0x${"a".repeat(64)}`, revision: 1 })),
    list: jest.fn(async () => []),
    prepareDecision: jest.fn(async () => ({ decisionHash: `0x${"b".repeat(64)}` })),
    readFile: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PayoutController],
      providers: [{ provide: PayoutService, useValue: payout }],
    }).overrideGuard(AuthGuard).useValue({
      canActivate(context: any) {
        context.switchToHttp().getRequest().account = { userId: "00000000-0000-4000-8000-000000000001", roles: [] };
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it("keeps dossier creation separate from the wallet transaction", async () => {
    await request(app.getHttpServer())
      .post("/v1/fundtogether/campaigns/00000000-0000-4000-8000-000000000002/payout-requests")
      .field("amount", "100")
      .field("title", "Final payout")
      .field("summary", "A complete payout summary for review.")
      .field("reason", "A complete payout reason for review.")
      .field("breakdown", "The full escrow balance is requested.")
      .attach("explanationFiles", Buffer.from("explanation"), { filename: "use-of-funds.pdf", contentType: "application/pdf" })
      .expect(201);
    expect(payout.create).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({ amount: "100", title: "Final payout" }),
      expect.objectContaining({
        explanationFiles: expect.arrayContaining([expect.objectContaining({ originalname: "use-of-funds.pdf" })]),
      }),
    );
  });

  it("exposes list and decision preparation as authenticated endpoints", async () => {
    await request(app.getHttpServer())
      .get("/v1/fundtogether/campaigns/00000000-0000-4000-8000-000000000002/payout-requests")
      .expect(200);
    await request(app.getHttpServer())
      .post("/v1/fundtogether/payout-requests/00000000-0000-4000-8000-000000000003/decisions")
      .send({ outcome: "APPROVE", reason: "A complete Resolver decision reason." })
      .expect(201);
    expect(payout.list).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001");
    expect(payout.prepareDecision).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000001",
      { outcome: "APPROVE", reason: "A complete Resolver decision reason." },
    );
  });
});
