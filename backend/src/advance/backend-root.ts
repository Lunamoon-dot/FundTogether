import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Nest emits dist/src/advance; ts-jest runs src/advance. Anchor tools to the package in both.
export const backendRoot = existsSync(resolve(__dirname, "../../scripts/workflow-b/guard-environment.cjs"))
  ? resolve(__dirname, "../..") : resolve(__dirname, "../../..");
