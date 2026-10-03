import { UnauthorizedException } from "@nestjs/common";
jest.mock("./auth.service", () => ({ AuthService: class AuthService {} }));
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

describe("AuthGuard", () => {
  const wallet = {
    userId: "user-1",
    address: "0x1111111111111111111111111111111111111111",
    chainId: 31337,
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

  it("attaches verified wallet identity from the session cookie", async () => {
    jest.mocked(authService.verifySession).mockResolvedValue(wallet);
    const request = { headers: { cookie: "other=x; ft_session=signed-token" } };
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(authService.verifySession).toHaveBeenCalledWith("signed-token");
    expect(request).toHaveProperty("wallet", wallet);
  });

  it("rejects requests without the session cookie", async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
