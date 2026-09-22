/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162 (RF03–RF07) — orquestra o parser (spec 162), a sanidade e o consenso (spec 160, reusados
 * sem alteração) e delega a escrita ao repositório. Puro na decisão, I/O só no repositório: dá para
 * testar o roteamento proposta/promoção sem banco (`decidePackageBoxCatalogGroups`, exportada) e a
 * escrita em si com Postgres (`test/integration/package-box-catalog-import.integration.ts`).
 *
 * ⚠️ **Sem referência de conteúdo (peso líquido unitário, faixa de densidade por NCM)**: nada em
 * produção guarda isso hoje — `nfe_products` não tem GTIN nem peso líquido, e o catálogo de
 * densidade por NCM da spec 160 nunca chegou a existir (spec 160 suspensa após a Fase 1). A
 * sanidade roda com `PackageBoxCatalogContentReference` vazio — só os dois códigos que não
 * dependem de conteúdo (`EDGE_TOO_LARGE`/`EDGE_TOO_SMALL`, e `UNIT_AMBIGUOUS` quando aplicável)
 * protegem por enquanto. `GROSS_WEIGHT_BELOW_CONTENT`/`DENSITY_OUT_OF_RANGE`/`VOLUME_BELOW_CONTENT`
 * voltam a valer no dia em que existir essa fonte — nenhuma mudança aqui, só a referência deixa de
 * ser vazia.
 */
import {
  mapPackageBoxCatalogCaptureLine,
  type PackageBoxCatalogCaptureCandidate,
} from '../domain/package-box-catalog-capture.mapper.js'
import { packageBoxCatalogCaptureLineSchema } from '../domain/package-box-catalog-capture.schema.js'
import {
  PACKAGE_BOX_CATALOG_CAPTURE_REJECTION_CODES,
  type PackageBoxCatalogCaptureRejectionCode,
} from '../domain/package-box-catalog-import.constant.js'
import { evaluatePackageBoxCatalogConsensus } from '../domain/package-box-catalog-consensus.policy.js'
import { evaluatePackageBoxCatalogSanity } from '../domain/package-box-catalog-sanity.policy.js'
import type {
  PackageBoxCatalogImportGroup,
  PackageBoxCatalogImportOutcome,
  PackageBoxCatalogImportRepositoryPort,
} from './package-box-catalog-import.port.js'

export type ImportPackageBoxCatalogRejection = {
  readonly cartonGtin: string
  readonly codes: readonly string[]
  readonly unitGtin: string
}

export type ImportPackageBoxCatalogReport = {
  readonly apply: boolean
  readonly ignoredStatus: number
  readonly invalidLines: number
  readonly linesRead: number
  readonly outcomes: Record<PackageBoxCatalogImportOutcome, number>
  readonly parseRejected: Record<PackageBoxCatalogCaptureRejectionCode, number>
  readonly rejections: readonly ImportPackageBoxCatalogRejection[]
  readonly sanityRejected: number
}

export type ImportPackageBoxCatalog = {
  execute(input: {
    readonly apply: boolean
    readonly lines: readonly string[]
  }): Promise<ImportPackageBoxCatalogReport>
}

type MappedLine = {
  readonly candidate: PackageBoxCatalogCaptureCandidate
  readonly unitGtin: string
}

/**
 * RF04/RF05, pura: separa candidatas aceitas na sanidade das rejeitadas, e decide por `cartonGtin`
 * se é proposta (fonte única) ou promoção (duas fontes concordando, `evaluatePackageBoxCatalogConsensus`).
 */
export function decidePackageBoxCatalogGroups(mapped: readonly MappedLine[]): {
  readonly groups: readonly PackageBoxCatalogImportGroup[]
  readonly rejections: readonly ImportPackageBoxCatalogRejection[]
} {
  const byCartonGtin = new Map<string, MappedLine[]>()
  for (const line of mapped) {
    const existing = byCartonGtin.get(line.candidate.cartonGtin)
    if (existing === undefined) byCartonGtin.set(line.candidate.cartonGtin, [line])
    else existing.push(line)
  }

  const groups: PackageBoxCatalogImportGroup[] = []
  const rejections: ImportPackageBoxCatalogRejection[] = []

  for (const [cartonGtin, lines] of byCartonGtin) {
    const accepted: MappedLine[] = []
    for (const line of lines) {
      const sanity = evaluatePackageBoxCatalogSanity(line.candidate, {})
      if (sanity.accepted) accepted.push(line)
      else rejections.push({ cartonGtin, codes: sanity.reasons, unitGtin: line.unitGtin })
    }
    if (accepted.length === 0) continue

    const consensus = evaluatePackageBoxCatalogConsensus(
      accepted.map((line) => ({
        grossWeightGrams: line.candidate.grossWeightGrams,
        heightMm: line.candidate.heightMm,
        lengthMm: line.candidate.lengthMm,
        provider: line.candidate.engine,
        widthMm: line.candidate.widthMm,
      })),
    )

    groups.push({
      candidates: accepted.map((line) => ({
        engine: line.candidate.engine,
        grossWeightGrams: line.candidate.grossWeightGrams,
        heightMm: line.candidate.heightMm,
        lengthMm: line.candidate.lengthMm,
        unitsPerBox: line.candidate.unitsPerBox,
        widthMm: line.candidate.widthMm,
      })),
      cartonGtin,
      promoted: consensus.promoted,
    })
  }

  return { groups, rejections }
}

function emptyOutcomeCounts(): Record<PackageBoxCatalogImportOutcome, number> {
  return {
    duplicate: 0,
    no_matching_box: 0,
    promoted: 0,
    proposed: 0,
    skipped_measured: 0,
  }
}

function emptyParseRejectedCounts(): Record<PackageBoxCatalogCaptureRejectionCode, number> {
  return Object.fromEntries(
    PACKAGE_BOX_CATALOG_CAPTURE_REJECTION_CODES.map((code) => [code, 0]),
  ) as Record<PackageBoxCatalogCaptureRejectionCode, number>
}

export function createImportPackageBoxCatalog(dependencies: {
  readonly repository: PackageBoxCatalogImportRepositoryPort
}): ImportPackageBoxCatalog {
  return {
    async execute(input): Promise<ImportPackageBoxCatalogReport> {
      const parseRejected = emptyParseRejectedCounts()
      let ignoredStatus = 0
      let invalidLines = 0
      const mapped: MappedLine[] = []

      for (const rawLine of input.lines) {
        const trimmed = rawLine.trim()
        if (trimmed.length === 0) continue

        let json: unknown
        try {
          json = JSON.parse(trimmed)
        } catch {
          invalidLines += 1
          continue
        }
        const parsed = packageBoxCatalogCaptureLineSchema.safeParse(json)
        if (!parsed.success) {
          invalidLines += 1
          continue
        }

        const result = mapPackageBoxCatalogCaptureLine(parsed.data)
        if (!result.accepted) {
          if (result.code === 'IGNORED_STATUS') ignoredStatus += 1
          else parseRejected[result.code] += 1
          continue
        }

        mapped.push({ candidate: result.candidate, unitGtin: parsed.data.unitGtin })
      }

      const { groups, rejections } = decidePackageBoxCatalogGroups(mapped)
      const outcomes = emptyOutcomeCounts()

      if (groups.length > 0) {
        const results = await dependencies.repository.importCandidates({
          apply: input.apply,
          groups,
        })
        for (const result of results) outcomes[result.outcome] += 1
      }

      return {
        apply: input.apply,
        ignoredStatus,
        invalidLines,
        linesRead: input.lines.length,
        outcomes,
        parseRejected,
        rejections,
        sanityRejected: rejections.length,
      }
    },
  }
}
