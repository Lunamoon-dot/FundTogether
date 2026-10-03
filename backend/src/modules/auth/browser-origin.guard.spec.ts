import { ForbiddenException } from "@nestjs/common";
jest.mock("@nestjs/config", () => ({ ConfigService: class {} }));
import { BrowserOriginGuard } from "./browser-origin.guard";

describe("browser origin protection", () => {
  const guard = new BrowserOriginGuard({
    getOrThrow: () => "http://localhost:5173",
  } as never);
  const context = (method: string, origin?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, headers: { origin } }),
      }),
    }) as never;
  it("allows safe reads without Origin", () =>
    expect(guard.canActivate(context("GET"))).toBe(true));
  it("allows same-origin writes", () =>
    expect(guard.canActivate(context("POST", "http://localhost:5173"))).toBe(
      true,
    ));
  it.each([undefined, "https://untrusted.example"])(
    "rejects writes with Origin %s",
    (origin) => {
      expect(() => guard.canActivate(context("POST", origin))).toThrow(
        ForbiddenException,
      );
    },
  );
});
