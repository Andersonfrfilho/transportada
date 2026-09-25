/* Cópia por valor de apps/frontend-transportada/src/modules/identity/shared/smokeAuthBypass.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * As duas travas: a flag **e** o hostname local. Uma sozinha não basta — a flag pode vazar para um
 * build publicado (o `Dockerfile` nunca a declara, ADR-0075 §7) e o hostname sozinho abriria o
 * bypass para qualquer app rodando em `localhost`. A T4.1 (Playwright) é quem liga isto a algo.
 */
const LOCAL_SMOKE_HOSTNAMES = new Set(['127.0.0.1', 'localhost'])

export function isSmokeAuthBypassEnabled(): boolean {
  return (
    import.meta.env.VITE_SMOKE_AUTH_BYPASS === 'true' &&
    LOCAL_SMOKE_HOSTNAMES.has(globalThis.location?.hostname ?? '')
  )
}
