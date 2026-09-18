/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Teto próprio da exportação do que falta medir: ela lê a empresa inteira numa chamada (até
 * `PACKAGE_BOX_PENDING_EXPORT_MAX_ITEMS` caixas), e é um clique de download, não a fila que a tela
 * relê a cada bipe. Balde em memória, por usuário — mesmo molde de `toll-booth-extract.rate-limit.ts`:
 * o custo é do processo que atende, não de um terceiro cobrado por chamada.
 */
const ONE_MINUTE_MS = 60_000

export const PACKAGE_BOX_PENDING_EXPORT_RATE_LIMIT = {
  maxRequests: 10,
  store: 'memory',
  windowMs: 5 * ONE_MINUTE_MS,
} as const
