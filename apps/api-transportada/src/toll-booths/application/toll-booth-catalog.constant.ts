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
export const TOLL_BOOTH_EXTRACT_AUDIT_TARGET_TYPE = 'toll_booth_extract'
