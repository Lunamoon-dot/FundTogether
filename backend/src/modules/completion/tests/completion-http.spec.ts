import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AuthGuard } from "../../auth/auth.guard";
import { CompletionController } from "../controllers/completion.controller";
import { CompletionService } from "../services/completion.service";

describe("CompletionController", () => {
  let app: INestApplication;
  const completion = {
    create: jest.fn(async () => ({ requestHash: `0x${"a".repeat(64)}`, revision: 1 })),
    list: jest.fn(async () => []),
    prepareDecision: jest.fn(async () => ({ decisionHash: `0x${"b".repeat(64)}` })),
    readFile: jest.fn(),
    listClaims: jest.fn(async () => []),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CompletionController], providers: [{ provide: CompletionService, useValue: completion }],
    }).overrideGuard(AuthGuard).useValue({ canActivate(context: any) {
      context.switchToHttp().getRequest().account = { userId: "00000000-0000-4000-8000-000000000001", roles: [] }; return true;
    } }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it("keeps completion dossier creation separate from the wallet transaction", async () => {
    await request(app.getHttpServer())
      .post("/v1/fundtogether/campaigns/00000000-0000-4000-8000-000000000002/completion-requests")
      .field("title", "Completion dossier")
      .field("summary", "A complete completion summary for review.")
      .field("reason", "A complete completion reason for review.")
      .expect(201);
    expect(completion.create).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({ title: "Completion dossier" }), [],
    );
  });

  it("exposes list, claims, file access and decision preparation as authenticated endpoints", async () => {
    await request(app.getHttpServer()).get("/v1/fundtogether/campaigns/00000000-0000-4000-8000-000000000002/completion-requests").expect(200);
    await request(app.getHttpServer()).get("/v1/fundtogether/campaigns/00000000-0000-4000-8000-000000000002/surplus-claims").expect(200);
    await request(app.getHttpServer()).post("/v1/fundtogether/completion-requests/00000000-0000-4000-8000-000000000003/decisions")
      .send({ outcome: "APPROVE", reason: "A complete Resolver decision reason." }).expect(201);
    expect(completion.list).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001");
    expect(completion.listClaims).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001");
  });
});
