/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 160, RF05/RNF03 — limites fechados da sanidade e do consenso de catálogo de GTIN.
 */

/** RF05: aresta abaixo disto é fisicamente implausível para caixa master. */
export const EDGE_MIN_MM = 20

/** RF05: aresta acima disto é fisicamente implausível para caixa master. */
export const EDGE_MAX_MM = 2500

/** RNF03: duas fontes só concordam se cada aresta diverge no máximo isto. */
export const CATALOG_CONSENSUS_TOLERANCE_MM = 15

/** RNF03: duas fontes só concordam se o peso bruto divergir no máximo 5%. */
export const CATALOG_CONSENSUS_WEIGHT_TOLERANCE_RATIO = 0.05

/** RF05: os seis códigos fechados de rejeição da sanidade — estáveis, nunca texto livre. */
export const PACKAGE_BOX_CATALOG_SANITY_REJECTION_CODES = [
  'EDGE_TOO_LARGE',
  'EDGE_TOO_SMALL',
  'GROSS_WEIGHT_BELOW_CONTENT',
  'DENSITY_OUT_OF_RANGE',
  'VOLUME_BELOW_CONTENT',
  'UNIT_AMBIGUOUS',
] as const
export type PackageBoxCatalogSanityRejectionCode =
  (typeof PACKAGE_BOX_CATALOG_SANITY_REJECTION_CODES)[number]
