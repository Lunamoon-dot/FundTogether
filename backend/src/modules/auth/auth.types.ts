export interface AuthenticatedWallet {
  userId: string;
  address: string;
  chainId: number;
}

declare global {
  namespace Express {
    interface Request {
      wallet?: AuthenticatedWallet;
    }
  }
}
