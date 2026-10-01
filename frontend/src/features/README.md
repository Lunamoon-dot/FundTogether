# Feature modules

Each feature owns its domain API hooks, schemas, components, pages, and types.

Use `lib/api` for shared HTTP transport and generated clients. Keep server data in TanStack Query; use Zustand only for client-only state.
