/* Copyright (c) 2026 Ada Technology. MIT License. */
const LOCAL_SMOKE_HOSTNAMES = new Set(['127.0.0.1', 'localhost'])

export function isSmokeAuthBypassEnabled(): boolean {
  return (
    import.meta.env.VITE_SMOKE_AUTH_BYPASS === 'true' &&
    LOCAL_SMOKE_HOSTNAMES.has(globalThis.location?.hostname ?? '')
  )
}
