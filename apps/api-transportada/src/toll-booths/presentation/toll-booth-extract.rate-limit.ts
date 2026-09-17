/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão final da spec 154 (D-8): teto próprio das duas rotas de escrita do extrato, que subiram
 * sem nenhum. A security.md §3 pede limite mais duro onde a chamada dispara custo, e aqui ele é
 * real: o `POST` grava até 1 MiB no bucket, e a recarga baixa o objeto e calcula o sha256 **antes**
 * de pegar a trava (deliberado, para encurtar o lock), então chamadas concorrentes pagam um
 * download cada para receber 409.
 *
 * Balde em memória, por usuário — o custo é do processo que atende (banda e CPU), não de um
 * terceiro cobrado por chamada; o balde compartilhado no Postgres existe para envio de e-mail, e
 * hoje todo serviço roda com uma réplica (`.railway/railway.ts`). Janela larga e teto pequeno:
 * subir extrato e recarregar catálogo são atos de administração, algumas vezes por semana, e quem
 * erra o `dataset` ou a data refaz duas ou três vezes seguidas — seis cabe nisso sem estorvar.
 */
/** Declarado aqui como nos dois vizinhos que também têm teto — não há cópia compartilhada. */
const ONE_MINUTE_MS = 60_000

export const TOLL_BOOTH_EXTRACT_UPLOAD_RATE_LIMIT = {
  maxRequests: 6,
  store: 'memory',
  windowMs: 30 * ONE_MINUTE_MS,
} as const

export const TOLL_BOOTH_CATALOG_RELOAD_RATE_LIMIT = {
  maxRequests: 6,
  store: 'memory',
  windowMs: 30 * ONE_MINUTE_MS,
} as const
