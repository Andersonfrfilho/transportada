/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CargoPreviewMatchEvidence,
  CargoPreviewMatchState,
} from './cargo-preview-matching.constant.js'

/** A linha da prévia que se quer vincular. Decimais em texto (`value` 2 casas, `weightKg` 3). */
export type CargoPreviewMatchItem = {
  readonly city: string | undefined
  readonly itemKey: string
  readonly postalCode: string | undefined
  readonly recipientCode: string | undefined
  readonly recipientName: string | undefined
  readonly routeName: string
  readonly value: string
  readonly weightKg: string
}

/** A nota do emitente do perfil, ainda livre; `loadReference` é o `NroCarga` já extraído. */
export type CargoPreviewCandidateDocument = {
  readonly grossWeightKg: string | undefined
  readonly id: string
  readonly issuedAt: string
  readonly loadReference: string | undefined
  readonly number: string
  readonly recipientCity: string | undefined
  readonly recipientName: string | undefined
  readonly recipientPostalCode: string | undefined
  readonly recipientTaxId: string | undefined
  readonly totalValue: string
}

export type RecipientAlias = { readonly recipientCode: string; readonly recipientTaxId: string }
export type RouteLoadPair = { readonly loadReference: string; readonly routeName: string }

/** Orçamento cooperativo do vínculo: o chamador decide o prazo e o erro (ele roda sob a trava). */
export type MatchingBudget = { readonly check: () => void }

export type ResolveCargoPreviewMatchesParams = {
  readonly budget: MatchingBudget
  readonly candidates: readonly CargoPreviewCandidateDocument[]
  readonly items: readonly CargoPreviewMatchItem[]
  readonly knownAliases: readonly RecipientAlias[]
  /** Pares desta prévia já firmados (vínculo anterior ou operador): o `NroCarga` muda a cada dia. */
  readonly knownRoutePairs: readonly RouteLoadPair[]
  readonly weightTolerancePercent: number
}

export type CargoPreviewItemMatch = {
  readonly documentIds: readonly string[]
  readonly evidence: readonly CargoPreviewMatchEvidence[]
  readonly itemKey: string
  readonly state: CargoPreviewMatchState
}

export type CargoPreviewRoutePairing = RouteLoadPair & {
  readonly source: 'known' | 'totals' | 'votes'
}

export type ResolveCargoPreviewMatchesResult = {
  readonly items: readonly CargoPreviewItemMatch[]
  readonly learnedAliases: readonly RecipientAlias[]
  readonly routePairs: readonly CargoPreviewRoutePairing[]
}

/** Linha em unidades inteiras (centavo, grama), pronta para somar sem float. */
export type MatchLine = {
  readonly index: number
  readonly itemKey: string
  readonly nameKey: string | undefined
  readonly postalCode: string | undefined
  readonly recipientCode: string | undefined
  readonly routeName: string
  readonly valueCents: bigint
  readonly weightGrams: bigint
}

export type MatchDocument = {
  readonly id: string
  readonly loadReference: string | undefined
  readonly nameKey: string | undefined
  readonly postalCode: string | undefined
  readonly taxId: string | undefined
  readonly valueCents: bigint
  readonly weightGrams: bigint | undefined
}

/** `lineGrams` é a soma de `lineCount` linhas; `documentGrams` a da nota (ou das notas da carga). */
export type WeightClosesParams = {
  readonly documentGrams: bigint | undefined
  readonly lineCount: number
  readonly lineGrams: bigint
}

/** Fecha o peso: dentro do arredondamento das linhas somadas ou da tolerância do perfil. */
export type WeightCloses = (params: WeightClosesParams) => boolean

export type LineDecision = {
  readonly documentIds: readonly string[]
  readonly evidence: ReadonlySet<CargoPreviewMatchEvidence>
  readonly state: Exclude<CargoPreviewMatchState, 'awaiting_xml'>
}
