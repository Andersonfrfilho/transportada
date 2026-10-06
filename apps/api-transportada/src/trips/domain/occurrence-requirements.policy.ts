/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF5, D-a): o que a ocorrência de nota exige — foto, observação, assinatura e produtos,
 * mais os dois mínimos — resolvido em três camadas (destinatário > contratante > tipo > padrão),
 * **campo a campo**, por `resolveWithOverrides`. Nulo (ou ausente) na exceção herda do tipo, e é o
 * mesmo resolvedor que serve ao snapshot do motorista, à verificação e ao registro no servidor.
 *
 * `items_mode` e `items_minimum_count` viajam como **par**: exceção com `items_mode` nulo herda o par
 * do tipo; declarado, vale o par da exceção, e mínimo nulo ali é "todos os itens da nota".
 */
import {
  OCCURRENCE_ITEMS_MODE,
  OCCURRENCE_PHOTO_MINIMUM_COUNT,
  OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS,
} from '../../shared/trip-occurrence.constant.js'
import { resolveWithOverrides } from '../../shared/resolve-with-overrides.policy.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'

export const OCCURRENCE_REQUIREMENT_LAYER = {
  contractor: 'contractor',
  default: 'default',
  recipient: 'recipient',
  type: 'type',
} as const

export type OccurrenceRequirementLayer =
  (typeof OCCURRENCE_REQUIREMENT_LAYER)[keyof typeof OCCURRENCE_REQUIREMENT_LAYER]

export type OccurrenceRequirements = {
  /** Nulo é "todos os itens da nota"; só vale com `itemsMode = 'required'`. */
  readonly itemsMinimumCount: null | number
  readonly itemsMode: DeliveryProofFieldMode
  readonly noteMode: DeliveryProofFieldMode
  readonly photoMinimumCount: number
  readonly photoMode: DeliveryProofFieldMode
  readonly signatureMode: DeliveryProofFieldMode
}

export type OccurrenceRequirementSources = Readonly<
  Record<keyof OccurrenceRequirements, OccurrenceRequirementLayer>
>

/**
 * O que uma camada declara. Ausente e nulo dizem a mesma coisa: herda. O tipo declara os seis (as
 * colunas são `NOT NULL`, salvo o mínimo de produtos); só os dublês de teste omitem algum.
 */
export type OccurrenceRequirementDeclaration = {
  readonly attachmentMode?: DeliveryProofFieldMode | null | undefined
  readonly itemsMinimumCount?: null | number | undefined
  readonly itemsMode?: DeliveryProofFieldMode | null | undefined
  readonly noteMode?: DeliveryProofFieldMode | null | undefined
  readonly photoMinimumCount?: null | number | undefined
  readonly signatureMode?: DeliveryProofFieldMode | null | undefined
}

export type ResolveOccurrenceRequirementsParams = {
  readonly contractorOverride: null | OccurrenceRequirementDeclaration
  readonly recipientOverride: null | OccurrenceRequirementDeclaration
  readonly type: OccurrenceRequirementDeclaration
}

export type ResolveOccurrenceRequirementsResult = {
  readonly requirements: OccurrenceRequirements
  readonly sources: OccurrenceRequirementSources
}

type Layered<TValue> = { readonly layer: OccurrenceRequirementLayer; readonly value: TValue }

type ItemsPair = { readonly minimum: null | number; readonly mode: DeliveryProofFieldMode }

function layered<TValue>(
  value: null | TValue | undefined,
  layer: OccurrenceRequirementLayer,
): Layered<TValue> | null {
  return value === null || value === undefined ? null : { layer, value }
}

type ResolveFieldParams<TValue> = {
  readonly contractor: null | TValue | undefined
  readonly fallback: TValue
  readonly recipient: null | TValue | undefined
  readonly type: null | TValue | undefined
}

/** A precedência é a de `resolveWithOverrides`; aqui só se marca de qual camada o valor veio. */
function resolveField<TValue>(params: ResolveFieldParams<TValue>): Layered<TValue> {
  return resolveWithOverrides<Layered<TValue>>({
    contractorOverride: layered(params.contractor, OCCURRENCE_REQUIREMENT_LAYER.contractor),
    fallback: { layer: OCCURRENCE_REQUIREMENT_LAYER.default, value: params.fallback },
    general: layered(params.type, OCCURRENCE_REQUIREMENT_LAYER.type),
    recipientOverride: layered(params.recipient, OCCURRENCE_REQUIREMENT_LAYER.recipient),
  })
}

function toItemsPair(declaration: null | OccurrenceRequirementDeclaration): ItemsPair | null {
  if (declaration?.itemsMode === undefined || declaration.itemsMode === null) return null
  return { minimum: declaration.itemsMinimumCount ?? null, mode: declaration.itemsMode }
}

type ModeField = 'attachmentMode' | 'noteMode' | 'signatureMode'

type ResolveModeParams = {
  readonly fallback: DeliveryProofFieldMode
  readonly field: ModeField
  readonly layers: ResolveOccurrenceRequirementsParams
}

function resolveMode(params: ResolveModeParams): Layered<DeliveryProofFieldMode> {
  const { contractorOverride, recipientOverride, type } = params.layers
  return resolveField<DeliveryProofFieldMode>({
    contractor: contractorOverride?.[params.field],
    fallback: params.fallback,
    recipient: recipientOverride?.[params.field],
    type: type[params.field],
  })
}

type ResolvedLayers = {
  readonly items: Layered<ItemsPair>
  readonly noteMode: Layered<DeliveryProofFieldMode>
  readonly photoMinimumCount: Layered<number>
  readonly photoMode: Layered<DeliveryProofFieldMode>
  readonly signatureMode: Layered<DeliveryProofFieldMode>
}

function toRequirementsResult(resolved: ResolvedLayers): ResolveOccurrenceRequirementsResult {
  const { items, noteMode, photoMinimumCount, photoMode, signatureMode } = resolved
  return {
    requirements: {
      itemsMinimumCount: items.value.minimum,
      itemsMode: items.value.mode,
      noteMode: noteMode.value,
      photoMinimumCount: photoMinimumCount.value,
      photoMode: photoMode.value,
      signatureMode: signatureMode.value,
    },
    sources: {
      itemsMinimumCount: items.layer,
      itemsMode: items.layer,
      noteMode: noteMode.layer,
      photoMinimumCount: photoMinimumCount.layer,
      photoMode: photoMode.layer,
      signatureMode: signatureMode.layer,
    },
  }
}

export function resolveOccurrenceRequirements(
  params: ResolveOccurrenceRequirementsParams,
): ResolveOccurrenceRequirementsResult {
  const { contractorOverride, recipientOverride, type } = params
  const photoMode = resolveMode({ fallback: 'off', field: 'attachmentMode', layers: params })
  const noteMode = resolveMode({
    fallback: OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS.noteMode,
    field: 'noteMode',
    layers: params,
  })
  const signatureMode = resolveMode({
    fallback: OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS.signatureMode,
    field: 'signatureMode',
    layers: params,
  })
  const photoMinimumCount = resolveField<number>({
    contractor: contractorOverride?.photoMinimumCount,
    fallback: OCCURRENCE_PHOTO_MINIMUM_COUNT.default,
    recipient: recipientOverride?.photoMinimumCount,
    type: type.photoMinimumCount,
  })
  const items = resolveField<ItemsPair>({
    contractor: toItemsPair(contractorOverride),
    fallback: { minimum: null, mode: OCCURRENCE_ITEMS_MODE.optional },
    recipient: toItemsPair(recipientOverride),
    type: toItemsPair(type),
  })

  return toRequirementsResult({ items, noteMode, photoMinimumCount, photoMode, signatureMode })
}
