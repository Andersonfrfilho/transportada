/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const TOLL_BOOTH_CATALOG_DEFAULT_PAGE = 1
export const TOLL_BOOTH_CATALOG_DEFAULT_PER_PAGE = 20
export const TOLL_BOOTH_CATALOG_MAX_PER_PAGE = 100
/**
 * Trava global da recarga (RNF3): dois extratos diferentes intercalariam upserts em `toll_booths`.
 * Literal fixo, como `ENVIRONMENT_PROVISIONING_LOCK_ID` (14_026) e `LOCAL_IDENTITY_SEED_LOCK_ID` (14_014).
 */
export const TOLL_BOOTH_CATALOG_RELOAD_LOCK_ID = 14_154
export const TOLL_BOOTH_CATALOG_RELOAD_AUDIT_ACTION = 'toll_booth_catalog.reloaded'
/**
 * Validade da contagem do RF2 em cache (T503 defeito 2). A invalidação por empresa só alcança o
 * processo que atendeu a mutação: com mais de uma réplica, a cópia das outras ficaria parada até o
 * próximo deploy. O teto limita essa divergência a um minuto, e recalcular custa uma leitura de
 * duas colunas — barato o bastante para não valer estado compartilhado.
 */
export const TOLL_BOOTH_AXLE_CHARGE_GAP_CACHE_TTL_MS = 60_000
export const TOLL_BOOTH_EXTRACT_AUDIT_TARGET_TYPE = 'toll_booth_extract'
