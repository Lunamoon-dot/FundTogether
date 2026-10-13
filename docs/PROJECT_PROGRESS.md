# Project progress

## Current focus

- IN_PROGRESS: Reward-only local runtime and fresh migration baseline.
- DONE: Reward contract suite: 12 tests passed (9 Reward, 3 MockUSDC).
- DONE: Reward backend unit suite: 17 tests passed.
- DONE: Reward frontend test, lint, and production build passed.
- DONE: Legacy source, frontend routes, scripts, contracts, and old migration lineage removed from active repository code.

## Known runtime limitation

The local WSL Anvil currently accepts RPC inside WSL but Windows cannot reach its `127.0.0.1:9548` bridge. The Reward launcher fails closed rather than claiming a ready deployment. Resolve the Windows-to-WSL localhost bridge before fresh end-to-end runtime verification.
