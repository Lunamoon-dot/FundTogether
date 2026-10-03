import { UnauthorizedException } from "@nestjs/common";
jest.mock("./auth.service", () => ({ AuthService: class AuthService {} }));
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

describe("AuthGuard", () => {
  const account = {
    userId: "user-1",
    email: "donor@example.com",
    wallets: [],
  };
  const authService = {
    verifySession: jest.fn(),
  } as unknown as AuthService;
  const guard = new AuthGuard(authService);
  const context = (cookie?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { cookie } }),
      }),
    }) as never;

  beforeEach(() => jest.clearAllMocks());

  it("authenticates an account without a wallet", async () => {
    jest.mocked(authService.verifySession).mockResolvedValue(account as never);
    const request = { headers: { cookie: "other=x; ft_session=signed-token" } };
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(authService.verifySession).toHaveBeenCalledWith("signed-token");
    expect(request).toHaveProperty("account", account);
  });

  it("rejects requests without the session cookie", async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
