jest.mock("@nestjs/config", () => ({ ConfigService: class {
  constructor(private values: Record<string, unknown> = {}) {}
  get(key: string) { return this.values[key]; }
} }));
import { ConfigService } from "@nestjs/config";
import { sessionCookieName, readSessionCookie } from "./auth-cookie";

describe("session cookie boundary", () => {
  const cookie = "ft_session=A; ft_workflow_b_session=B; ft_session_extra=wrong";
  it("keeps A default and selects only B's exact name", () => {
    expect(sessionCookieName(new ConfigService({}))).toBe("ft_session");
    expect(sessionCookieName(new ConfigService({ authSessionCookieName: "ft_workflow_b_session" }))).toBe("ft_workflow_b_session");
    expect(readSessionCookie(cookie, "ft_session")).toBe("A");
    expect(readSessionCookie(cookie, "ft_workflow_b_session")).toBe("B");
    expect(readSessionCookie("ft_session=A", "ft_workflow_b_session")).toBeUndefined();
  });
  it("does not accept ambiguous duplicate session cookies", () => {
    expect(readSessionCookie("ft_session=first; ft_session=second", "ft_session")).toBeUndefined();
    expect(readSessionCookie("ft_session_extra=wrong", "ft_session")).toBeUndefined();
  });
});
