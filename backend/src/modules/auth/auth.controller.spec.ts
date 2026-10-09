jest.mock("./auth.service", () => ({ AuthService: class {}, SESSION_TTL_MS: 86400000 }));
jest.mock("@nestjs/config", () => ({ ConfigService: class {
  constructor(private values: Record<string, unknown> = {}) {}
  get(key: string) { return this.values[key]; }
} }));
import { ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import type { Request, Response } from "express";

describe("AuthController cookie isolation", () => {
  const request = { headers: { cookie: "ft_session=A; ft_workflow_b_session=B" } } as Request;
  it.each([undefined, "ft_workflow_b_session"])("login/logout acts only on configured cookie %s", async name => {
    const service = { login: jest.fn().mockResolvedValue({ token: "fresh", account: { userId: "one" } }), revokeSession: jest.fn() };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const controller = new AuthController(service as unknown as AuthService,
      new ConfigService({ authSessionCookieName: name, nodeEnv: "development" }));
    const expected = name ?? "ft_session";
    await controller.login({ email: "user@example.test", password: "synthetic-fixture-password" }, request, response as unknown as Response);
    expect(service.revokeSession).toHaveBeenCalledWith(name ? "B" : "A");
    expect(response.cookie).toHaveBeenCalledWith(expected, "fresh", expect.objectContaining({ httpOnly: true, path: "/" }));
    await controller.logout(request, response as unknown as Response);
    expect(response.clearCookie).toHaveBeenCalledWith(expected, expect.objectContaining({ path: "/" }));
    expect(response.clearCookie).toHaveBeenCalledTimes(1);
  });
});
