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
  OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS,
  OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS,
} from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceDeclaredAmountScope } from '../../shared/trip-occurrence.constant.js'
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

/** Os seis campos da 246 — o recorte que o snapshot, o escritório e a verificação publicam hoje. */
export type OccurrenceCoreRequirements = {
  /** Nulo é "todos os itens da nota"; só vale com `itemsMode = 'required'`. */
  readonly itemsMinimumCount: null | number
  readonly itemsMode: DeliveryProofFieldMode
  readonly noteMode: DeliveryProofFieldMode
  readonly photoMinimumCount: number
  readonly photoMode: DeliveryProofFieldMode
  readonly signatureMode: DeliveryProofFieldMode
}

/**
 * Spec 247 (RF1, RF14, D8): o número do documento do cliente e o valor pago. Os dois **modos** têm
 * exceção por contratante/destinatário; o escopo do valor pago e os dois rótulos são só do tipo.
 */
export type OccurrenceRequirements = OccurrenceCoreRequirements & {
  readonly declaredAmountLabel: string
  readonly declaredAmountMode: DeliveryProofFieldMode
  readonly declaredAmountScope: OccurrenceDeclaredAmountScope
  readonly referenceNumberLabel: string
  readonly referenceNumberMode: DeliveryProofFieldMode
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
  readonly declaredAmountLabel?: null | string | undefined
  readonly declaredAmountMode?: DeliveryProofFieldMode | null | undefined
  readonly declaredAmountScope?: null | OccurrenceDeclaredAmountScope | undefined
  readonly itemsMinimumCount?: null | number | undefined
  readonly itemsMode?: DeliveryProofFieldMode | null | undefined
  readonly noteMode?: DeliveryProofFieldMode | null | undefined
  readonly photoMinimumCount?: null | number | undefined
  readonly referenceNumberLabel?: null | string | undefined
  readonly referenceNumberMode?: DeliveryProofFieldMode | null | undefined
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

type ModeField =
  | 'attachmentMode'
  | 'declaredAmountMode'
  | 'noteMode'
  | 'referenceNumberMode'
  | 'signatureMode'

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

/** O que só o tipo declara (D8): nenhuma exceção o muda, e a camada é `type` (ou `default` num dublê). */
function resolveTypeOnly<TValue>(value: null | TValue | undefined, fallback: TValue) {
  return resolveField<TValue>({ contractor: null, fallback, recipient: null, type: value })
}

type SingleLayers = Omit<
  { readonly [TKey in keyof OccurrenceRequirements]: Layered<OccurrenceRequirements[TKey]> },
  'itemsMinimumCount' | 'itemsMode'
>

type ResolvedLayers = SingleLayers & { readonly items: Layered<ItemsPair> }

function toRequirementsResult(resolved: ResolvedLayers): ResolveOccurrenceRequirementsResult {
  const { items, ...single } = resolved
  return {
    requirements: {
      declaredAmountLabel: single.declaredAmountLabel.value,
      declaredAmountMode: single.declaredAmountMode.value,
      declaredAmountScope: single.declaredAmountScope.value,
      itemsMinimumCount: items.value.minimum,
      itemsMode: items.value.mode,
      noteMode: single.noteMode.value,
      photoMinimumCount: single.photoMinimumCount.value,
      photoMode: single.photoMode.value,
      referenceNumberLabel: single.referenceNumberLabel.value,
      referenceNumberMode: single.referenceNumberMode.value,
      signatureMode: single.signatureMode.value,
    },
    sources: {
      declaredAmountLabel: single.declaredAmountLabel.layer,
      declaredAmountMode: single.declaredAmountMode.layer,
      declaredAmountScope: single.declaredAmountScope.layer,
      itemsMinimumCount: items.layer,
      itemsMode: items.layer,
      noteMode: single.noteMode.layer,
      photoMinimumCount: single.photoMinimumCount.layer,
      photoMode: single.photoMode.layer,
      referenceNumberLabel: single.referenceNumberLabel.layer,
      referenceNumberMode: single.referenceNumberMode.layer,
      signatureMode: single.signatureMode.layer,
    },
  }
}

/** O recorte da 246, para quem publica os tipos a uma tela que ainda não tolera os campos novos. */
export function pickCoreRequirements(
  requirements: OccurrenceCoreRequirements,
): OccurrenceCoreRequirements {
  return {
    itemsMinimumCount: requirements.itemsMinimumCount,
    itemsMode: requirements.itemsMode,
    noteMode: requirements.noteMode,
    photoMinimumCount: requirements.photoMinimumCount,
    photoMode: requirements.photoMode,
    signatureMode: requirements.signatureMode,
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

  const declarations = OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS
  return toRequirementsResult({
    declaredAmountLabel: resolveTypeOnly(
      type.declaredAmountLabel,
      declarations.declaredAmountLabel,
    ),
    declaredAmountMode: resolveMode({
      fallback: declarations.declaredAmountMode,
      field: 'declaredAmountMode',
      layers: params,
    }),
    declaredAmountScope: resolveTypeOnly<OccurrenceDeclaredAmountScope>(
      type.declaredAmountScope,
      declarations.declaredAmountScope,
    ),
    items,
    noteMode,
    photoMinimumCount,
    photoMode,
    referenceNumberLabel: resolveTypeOnly(
      type.referenceNumberLabel,
      declarations.referenceNumberLabel,
    ),
    referenceNumberMode: resolveMode({
      fallback: declarations.referenceNumberMode,
      field: 'referenceNumberMode',
      layers: params,
    }),
    signatureMode,
  })
}
