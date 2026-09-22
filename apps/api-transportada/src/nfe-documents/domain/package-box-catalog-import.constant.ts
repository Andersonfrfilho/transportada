/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162 — constantes do importador do catálogo coletado (RF02, RF03). Fica em arquivo próprio,
 * separado de `package-box-catalog.constant.ts` (spec 160): aquele arquivo é reusado sem alterar
 * uma linha, e o ator de sistema e os códigos de rejeição do parser são conceitos novos da 162.
 */

/**
 * RF02: ator de sistema fixo gravado em `nfe_package_box_measurements.measured_by_user_id` quando
 * a medida vem do importador de catálogo, nunca de um conferente humano. `measured_by_user_id` não
 * tem FK (ADR-0039, ver `plan.md` § "T003") — este UUID nunca precisa existir em `identity_users`.
 * Mesmo padrão de `SYSTEM_DISTRIBUTION_ACTOR_USER_ID`
 * (`identity/domain/system-distribution-actor.constant.ts`), com o próximo octeto livre.
 */
export const CATALOG_IMPORT_ACTOR_ID = '00000000-0000-4000-8000-000000000007'

/** RF03: motivos fechados de rejeição do parser/mapper — antes mesmo da sanidade (spec 160) rodar. */
export const PACKAGE_BOX_CATALOG_CAPTURE_REJECTION_CODES = [
  'IGNORED_STATUS',
  'CARTON_GTIN_MISSING',
  'EDGES_INCOMPLETE',
  'UNIT_MISSING',
] as const
export type PackageBoxCatalogCaptureRejectionCode =
  (typeof PACKAGE_BOX_CATALOG_CAPTURE_REJECTION_CODES)[number]

/** RF03: só estes dois status da captura (spec 161) viram candidata; o resto é `ignored_status`. */
export const PACKAGE_BOX_CATALOG_IMPORTABLE_STATUSES = ['found', 'found_manual'] as const
export type PackageBoxCatalogImportableStatus =
  (typeof PACKAGE_BOX_CATALOG_IMPORTABLE_STATUSES)[number]

/**
 * Spec 163 (RF05): status cuja linha pode trazer a medida da **unidade**. `no_dimensions` (Cosmos
 * sem a caixa, com a linha "Unidade") e `found_unit_manual` (Alt+U) deixam de ser ignorados quando
 * trazem `unitEdges`; a caixa continua só de `found`/`found_manual`.
 */
export const PACKAGE_BOX_CATALOG_UNIT_STATUSES = [
  'found',
  'found_manual',
  'found_unit_manual',
  'no_dimensions',
] as const

/** Spec 163: status que são do Cosmos — a unidade deles grava origem `catalog`. */
export const PACKAGE_BOX_CATALOG_COSMOS_STATUSES = ['found', 'no_dimensions'] as const
