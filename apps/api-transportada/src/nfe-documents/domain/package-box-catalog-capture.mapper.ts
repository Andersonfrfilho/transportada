/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162, RF03 — puro, sem I/O: recebe uma linha já validada pelo schema Zod e devolve a
 * candidata no formato que `evaluatePackageBoxCatalogSanity` (spec 160) consome, ou o código
 * fechado do motivo de rejeição. Nunca reinterpreta unidade — vírgula decimal e cm→mm/kg→g só pela
 * unidade **declarada** na linha; ausência de unidade é rejeição (CA01), nunca suposição.
 */
import {
  PACKAGE_BOX_CATALOG_IMPORTABLE_STATUSES,
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
