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
  mapPackageBoxCatalogCaptureUnit,
  type PackageBoxCatalogCaptureCandidate,
  type PackageBoxCatalogCaptureUnit,
} from '../domain/package-box-catalog-capture.mapper.js'
import { packageBoxCatalogCaptureLineSchema } from '../domain/package-box-catalog-capture.schema.js'
import {
  PACKAGE_BOX_CATALOG_CAPTURE_REJECTION_CODES,
  type PackageBoxCatalogCaptureRejectionCode,
} from '../domain/package-box-catalog-import.constant.js'
import { evaluatePackageBoxCatalogConsensus } from '../domain/package-box-catalog-consensus.policy.js'
import { evaluatePackageBoxCatalogSanity } from '../domain/package-box-catalog-sanity.policy.js'
import { evaluatePackageBoxUnitSanity } from '../domain/package-box-unit-sanity.policy.js'
import type {
  PackageBoxCatalogImportGroup,
  PackageBoxCatalogImportOutcome,
  PackageBoxCatalogImportRepositoryPort,
  PackageBoxCatalogImportUnit,
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
  /** Spec 163 (RF03): unidades recusadas pela sanidade da unidade (`UNIT_EDGE_OUT_OF_RANGE`…). */
  readonly unitRejected: number
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
    unit_recorded: 0,
    unit_skipped_typed: 0,
  }
}

/** Spec 163 (RF03): a unidade passa pela sanidade antes de qualquer gravação, nunca corrigida. */
function decidePackageBoxCatalogUnits(units: readonly PackageBoxCatalogCaptureUnit[]): {
  readonly accepted: readonly PackageBoxCatalogImportUnit[]
  readonly rejections: readonly ImportPackageBoxCatalogRejection[]
} {
  const accepted: PackageBoxCatalogImportUnit[] = []
  const rejections: ImportPackageBoxCatalogRejection[] = []
  for (const unit of units) {
    const sanity = evaluatePackageBoxUnitSanity(unit)
    if (!sanity.accepted) {
      rejections.push({
        cartonGtin: unit.cartonGtin,
        codes: sanity.reasons,
        unitGtin: unit.unitGtin,
      })
      continue
    }
    accepted.push({
      cartonGtin: unit.cartonGtin,
      ...(unit.grossWeightGrams === undefined ? {} : { grossWeightGrams: unit.grossWeightGrams }),
      heightMm: unit.heightMm,
      lengthMm: unit.lengthMm,
      source: unit.source,
      widthMm: unit.widthMm,
    })
  }
  return { accepted, rejections }
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
      const mappedUnits: PackageBoxCatalogCaptureUnit[] = []

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

        const unitResult = mapPackageBoxCatalogCaptureUnit(parsed.data)
        if (unitResult?.accepted === true) mappedUnits.push(unitResult.unit)
        else if (unitResult !== undefined) parseRejected[unitResult.code] += 1

        const result = mapPackageBoxCatalogCaptureLine(parsed.data)
        if (!result.accepted) {
          // Spec 163 (RF05): linha que só trouxe a unidade é válida — nem ignorada, nem rejeitada.
          if (unitResult !== undefined) continue
          if (result.code === 'IGNORED_STATUS') ignoredStatus += 1
          else parseRejected[result.code] += 1
          continue
        }

        mapped.push({ candidate: result.candidate, unitGtin: parsed.data.unitGtin })
      }

      const { groups, rejections } = decidePackageBoxCatalogGroups(mapped)
      const units = decidePackageBoxCatalogUnits(mappedUnits)
      const outcomes = emptyOutcomeCounts()

      if (groups.length > 0 || units.accepted.length > 0) {
        const results = await dependencies.repository.importCandidates({
          apply: input.apply,
          groups,
          units: units.accepted,
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
        rejections: [...rejections, ...units.rejections],
        sanityRejected: rejections.length,
        unitRejected: units.rejections.length,
      }
    },
  }
}
