import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Works from both src and Nest's dist/src output without coupling HED to a legacy workflow.
export const backendRoot = existsSync(resolve(__dirname, "../scripts"))
  ? resolve(__dirname, "..") : resolve(__dirname, "../..");
