/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162, RF03 — puro, sem I/O: recebe uma linha já validada pelo schema Zod e devolve a
 * candidata no formato que `evaluatePackageBoxCatalogSanity` (spec 160) consome, ou o código
 * fechado do motivo de rejeição. Nunca reinterpreta unidade — vírgula decimal e cm→mm/kg→g só pela
 * unidade **declarada** na linha; ausência de unidade é rejeição (CA01), nunca suposição.
 */
import {
  PACKAGE_BOX_CATALOG_COSMOS_STATUSES,
  PACKAGE_BOX_CATALOG_IMPORTABLE_STATUSES,
  PACKAGE_BOX_CATALOG_UNIT_STATUSES,
  type PackageBoxCatalogCaptureRejectionCode,
  type PackageBoxCatalogImportableStatus,
} from './package-box-catalog-import.constant.js'
import type { PackageBoxCatalogCandidate } from './package-box-catalog-sanity.policy.js'
import type {
  PackageBoxCatalogCaptureEdgeValue,
  PackageBoxCatalogCaptureLine,
} from './package-box-catalog-capture.schema.js'

export type PackageBoxCatalogCaptureCandidate = PackageBoxCatalogCandidate & {
  /** Chave de casamento com `nfe_package_boxes.carton_gtin` (RF06) — ver aviso no schema. */
  readonly cartonGtin: string
  /** `cosmos` para `status: found`; `manual:<domínio da página>` para `status: found_manual`. */
  readonly engine: string
  readonly unitGtin: string
}

export type PackageBoxCatalogCaptureMappingResult =
  | { readonly accepted: true; readonly candidate: PackageBoxCatalogCaptureCandidate }
  | { readonly accepted: false; readonly code: PackageBoxCatalogCaptureRejectionCode }

const IMPORTABLE_STATUSES: readonly string[] = PACKAGE_BOX_CATALOG_IMPORTABLE_STATUSES

function isImportableStatus(status: string): status is PackageBoxCatalogImportableStatus {
  return IMPORTABLE_STATUSES.includes(status)
}

/** Remove sufixo de unidade colado no valor ("330,0 cm" → "330,0") e normaliza vírgula decimal. */
function parseDecimal(rawValue: string): number | undefined {
  const withoutUnit = rawValue
    .trim()
    .replace(/[a-zçãéóú%]+\s*$/iu, '')
    .trim()
  if (withoutUnit.length === 0 || withoutUnit === '-') return undefined
  const normalized = withoutUnit.replaceAll('.', '').replace(',', '.')
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : undefined
}

function toMillimeters(edge: PackageBoxCatalogCaptureEdgeValue | undefined): number | undefined {
  if (edge === undefined) return undefined
  const unit = edge.unit.trim().toLowerCase()
  if (unit.length === 0) return undefined
  const numeric = parseDecimal(edge.value)
  if (numeric === undefined) return undefined
  if (unit === 'cm') return Math.round(numeric * 10)
  if (unit === 'mm') return Math.round(numeric)
  if (unit === 'm') return Math.round(numeric * 1000)
  return undefined
}

function toGrams(edge: PackageBoxCatalogCaptureEdgeValue | undefined): number | undefined {
  if (edge === undefined) return 0
  const unit = edge.unit.trim().toLowerCase()
  if (unit.length === 0) return undefined
  const numeric = parseDecimal(edge.value)
  if (numeric === undefined) return 0
  if (unit === 'kg') return Math.round(numeric * 1000)
  if (unit === 'g') return Math.round(numeric)
  return undefined
}

type EdgeTriplet = {
  readonly height: PackageBoxCatalogCaptureEdgeValue
  readonly length: PackageBoxCatalogCaptureEdgeValue
  readonly width: PackageBoxCatalogCaptureEdgeValue
}

/**
 * Cosmos rotula as três arestas (`comprimento`/`altura`/`largura`); a captura manual, sem tabela
 * fechada, só sabe a ordem em que o regex achou os números (`lado1`/`lado2`/`lado3`) — mapeada na
 * mesma ordem comprimento/largura/altura por convenção, sem outra forma de saber qual é qual.
 */
function pickEdgeTriplet(
  edges: Record<string, PackageBoxCatalogCaptureEdgeValue>,
): EdgeTriplet | undefined {
  const { altura, comprimento, largura, lado1, lado2, lado3 } = edges
  if (comprimento !== undefined && largura !== undefined && altura !== undefined) {
    return { height: altura, length: comprimento, width: largura }
  }
  if (lado1 !== undefined && lado2 !== undefined && lado3 !== undefined) {
    return { height: lado3, length: lado1, width: lado2 }
  }
  return undefined
}

function resolveEngine(line: PackageBoxCatalogCaptureLine): string {
  if (line.status === 'found') return line.source ?? 'cosmos'
  if (line.pageUrl !== undefined) {
    try {
      return `manual:${new URL(line.pageUrl).hostname}`
    } catch {
      return 'manual:unknown'
    }
  }
  return 'manual:unknown'
}

/** Spec 163 (RF05): a unidade da linha, em mm e g, com a origem que a caixa gravará. */
export type PackageBoxCatalogCaptureUnit = {
  readonly cartonGtin: string
  readonly grossWeightGrams?: number
  readonly heightMm: number
  readonly lengthMm: number
  /** `catalog` (Cosmos) ou `manual:<domínio da página>` — o `unit_measurement_source`. */
  readonly source: string
  readonly unitGtin: string
  readonly widthMm: number
}

export type PackageBoxCatalogCaptureUnitResult =
  | { readonly accepted: true; readonly unit: PackageBoxCatalogCaptureUnit }
  | { readonly accepted: false; readonly code: PackageBoxCatalogCaptureRejectionCode }

const UNIT_STATUSES: readonly string[] = PACKAGE_BOX_CATALOG_UNIT_STATUSES
const COSMOS_STATUSES: readonly string[] = PACKAGE_BOX_CATALOG_COSMOS_STATUSES

function resolveUnitSource(line: PackageBoxCatalogCaptureLine): string {
  if (COSMOS_STATUSES.includes(line.status)) return 'catalog'
  return resolveEngine(line)
}

/** Peso da unidade é opcional: ausente é `undefined`, nunca zero (o CHECK exige > 0). */
function toUnitGrams(
  edge: PackageBoxCatalogCaptureEdgeValue | undefined,
): number | 'invalid' | undefined {
  if (edge === undefined) return undefined
  const grams = toGrams(edge)
  if (grams === undefined) return 'invalid'
  return grams > 0 ? grams : undefined
}

/**
 * Spec 163 (RF05): a medida da **unidade** da linha. `undefined` quando a linha não traz
 * `unitEdges` (ou o status não carrega unidade) — nada a importar, e a caixa decide sozinha como
 * na 162. Nunca reinterpreta unidade: sem unidade declarada é `UNIT_MISSING`.
 */
export function mapPackageBoxCatalogCaptureUnit(
  line: PackageBoxCatalogCaptureLine,
): PackageBoxCatalogCaptureUnitResult | undefined {
  const unitEdges = line.extracted.unitEdges
  if (unitEdges === undefined || !UNIT_STATUSES.includes(line.status)) return undefined

  const cartonGtin = line.cartonGtin
  if (cartonGtin === undefined || cartonGtin.length === 0) {
    return { accepted: false, code: 'CARTON_GTIN_MISSING' }
  }
  const triplet = pickEdgeTriplet(unitEdges)
  if (triplet === undefined) return { accepted: false, code: 'EDGES_INCOMPLETE' }
  for (const edge of [triplet.length, triplet.width, triplet.height]) {
    if (edge.unit.trim().length === 0) return { accepted: false, code: 'UNIT_MISSING' }
  }

  const lengthMm = toMillimeters(triplet.length)
  const widthMm = toMillimeters(triplet.width)
  const heightMm = toMillimeters(triplet.height)
  const grossWeightGrams = toUnitGrams(line.extracted.unitGrossWeight)
  if (grossWeightGrams === 'invalid') return { accepted: false, code: 'UNIT_MISSING' }
  if (lengthMm === undefined || widthMm === undefined || heightMm === undefined) {
    return { accepted: false, code: 'EDGES_INCOMPLETE' }
  }

  return {
    accepted: true,
    unit: {
      cartonGtin,
      ...(grossWeightGrams === undefined ? {} : { grossWeightGrams }),
      heightMm,
      lengthMm,
      source: resolveUnitSource(line),
      unitGtin: line.unitGtin,
      widthMm,
    },
  }
}

export function mapPackageBoxCatalogCaptureLine(
  line: PackageBoxCatalogCaptureLine,
): PackageBoxCatalogCaptureMappingResult {
  if (!isImportableStatus(line.status)) return { accepted: false, code: 'IGNORED_STATUS' }

  const cartonGtin = line.cartonGtin
  if (cartonGtin === undefined || cartonGtin.length === 0) {
    return { accepted: false, code: 'CARTON_GTIN_MISSING' }
  }

  const triplet = pickEdgeTriplet(line.extracted.edges)
  if (triplet === undefined) return { accepted: false, code: 'EDGES_INCOMPLETE' }

  for (const edge of [triplet.length, triplet.width, triplet.height]) {
    if (edge.unit.trim().length === 0) return { accepted: false, code: 'UNIT_MISSING' }
  }
  if (
    line.extracted.grossWeight !== undefined &&
    line.extracted.grossWeight.unit.trim().length === 0
  ) {
    return { accepted: false, code: 'UNIT_MISSING' }
  }

  const lengthMm = toMillimeters(triplet.length)
  const widthMm = toMillimeters(triplet.width)
  const heightMm = toMillimeters(triplet.height)
  const grossWeightGrams = toGrams(line.extracted.grossWeight)
  if (
    lengthMm === undefined ||
    widthMm === undefined ||
    heightMm === undefined ||
    grossWeightGrams === undefined
  ) {
    return { accepted: false, code: 'EDGES_INCOMPLETE' }
  }

  return {
    accepted: true,
    candidate: {
      cartonGtin,
      engine: resolveEngine(line),
      grossWeightGrams,
      heightMm,
      lengthMm,
      unitGtin: line.unitGtin,
      unitsPerBox: line.extracted.unitsPerCarton ?? 1,
      widthMm,
    },
  }
}
