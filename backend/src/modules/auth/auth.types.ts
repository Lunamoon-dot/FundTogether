export interface AuthenticatedAccount {
  userId: string;
  email: string | null;
  roles: ("ADMIN" | "RESOLVER")[];
  wallets: { address: string; chainId: number }[];
}

declare global {
  namespace Express {
    interface Request {
      account?: AuthenticatedAccount;
      sessionToken?: string;
    }
  }
}
