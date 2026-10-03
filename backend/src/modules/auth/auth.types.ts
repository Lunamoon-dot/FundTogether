export interface AuthenticatedAccount {
  userId: string;
  email: string | null;
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
