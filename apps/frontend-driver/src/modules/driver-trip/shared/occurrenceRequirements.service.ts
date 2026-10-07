/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrenceType, ProofFieldRequirement } from './driverTrip.types'

/**
 * Spec 246 (RF1, RF7, RF1c, RF1c2): o que o tipo resolvido **para esta nota** exige do motorista.
 * Tudo vem do servidor, já resolvido em três camadas; aqui só se lê — e se tolera o campo ausente
 * (API anterior): observação opcional, assinatura desligada, produtos opcionais, foto pelo
 * `attachmentMode` e mínimo 1, que é exatamente o que o app fazia antes.
 */

/** O teto da API (`OCCURRENCE_PHOTO_MINIMUM_COUNT.max`): o app nunca oferece a sexta foto. */
export const OCCURRENCE_PHOTO_MAXIMUM_COUNT = 5

const DEFAULT_PHOTO_MINIMUM_COUNT = 1

/** Spec 247: onde se digita o valor pago — por produto (`item`) ou uma vez na ocorrência. */
export type DeclaredAmountScope = 'item' | 'occurrence'

export type OccurrenceRequirements = Readonly<{
  /** Spec 247 (RF1): o valor pago da loja; `off` não aparece. */
  declaredAmountMode: ProofFieldRequirement
  /** O do tipo — onde ele cai de fato depende das linhas marcadas (`resolveDeclaredAmountTarget`). */
  declaredAmountScope: DeclaredAmountScope
  /** `null` é "todos os itens da nota" (regra do servidor, 246 RF1c2). */
  itemsMinimumCount: number | null
  itemsMode: ProofFieldRequirement
  noteMode: ProofFieldRequirement
  photoMinimumCount: number
  photoMode: ProofFieldRequirement
  /** Spec 247 (RF1): o número do documento do cliente (NFD); `off` não aparece. */
  referenceNumberMode: ProofFieldRequirement
  signatureMode: ProofFieldRequirement
}>

/**
 * D-d da 246: a ocorrência de **parada** não lê exigência no servidor além da foto (que o app já
 * cobrava desde a 209). Nota, assinatura e produtos só valem para o tipo de nota — cobrar a
 * observação de uma parada no aparelho seria recusar o que o servidor aceita.
 */
const STOP_REQUIREMENTS = {
  declaredAmountMode: 'off',
  declaredAmountScope: 'occurrence',
  itemsMinimumCount: null,
  itemsMode: 'off',
  noteMode: 'optional',
  photoMinimumCount: DEFAULT_PHOTO_MINIMUM_COUNT,
  referenceNumberMode: 'off',
  signatureMode: 'off',
} as const

function readPhotoMinimumCount(type: DriverOccurrenceType): number {
  const count = type.photoMinimumCount
  const isValid =
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= DEFAULT_PHOTO_MINIMUM_COUNT &&
    count <= OCCURRENCE_PHOTO_MAXIMUM_COUNT
  return isValid ? count : DEFAULT_PHOTO_MINIMUM_COUNT
}

export function resolveOccurrenceRequirements(type: DriverOccurrenceType): OccurrenceRequirements {
  const photoMode = type.photoMode ?? type.attachmentMode ?? 'off'
  if (type.flow === 'stop') return { ...STOP_REQUIREMENTS, photoMode }
  return {
    declaredAmountMode: type.declaredAmountMode ?? 'off',
    declaredAmountScope: type.declaredAmountScope === 'occurrence' ? 'occurrence' : 'item',
    itemsMinimumCount: type.itemsMinimumCount ?? null,
    itemsMode: type.itemsMode ?? 'optional',
    noteMode: type.noteMode ?? 'optional',
    photoMinimumCount: readPhotoMinimumCount(type),
    photoMode,
    referenceNumberMode: type.referenceNumberMode ?? 'off',
    signatureMode: type.signatureMode ?? 'off',
  }
}

export type OccurrenceFieldVisibility = Readonly<{
  /** Spec 247: o valor pago da ocorrência ou o de cada linha — `off` não aparece. */
  rendersDeclaredAmount: boolean
  /** Spec 247: a lista de produtos da nota, com quantidade e soma, quando o snapshot a traz. */
  rendersItemsList: boolean
  /** Quantas fotos o formulário aceita: uma, ou até o teto quando o tipo exige mais de uma. */
  photoLimit: number
  rendersNote: boolean
  rendersPhoto: boolean
  /** Sem lista de itens no snapshot, o app só aponta a nota inteira — e só quando é exigido. */
  rendersProducts: boolean
  rendersReferenceNumber: boolean
  rendersSignature: boolean
}>

export function resolveOccurrenceFieldVisibility(
  type: DriverOccurrenceType,
  options?: Readonly<{ hasProductList: boolean }>,
): OccurrenceFieldVisibility {
  const requirements = resolveOccurrenceRequirements(type)
  const isStop = type.flow === 'stop'
  const hasProductList = options?.hasProductList === true
  const asksManyPhotos = requirements.photoMode === 'required' && requirements.photoMinimumCount > 1
  const rendersItemsList = !isStop && hasProductList && requirements.itemsMode !== 'off'
  return {
    photoLimit: !isStop && asksManyPhotos ? OCCURRENCE_PHOTO_MAXIMUM_COUNT : 1,
    rendersDeclaredAmount: requirements.declaredAmountMode !== 'off',
    rendersItemsList,
    rendersNote: isStop || requirements.noteMode !== 'off',
    rendersPhoto: requirements.photoMode !== 'off',
    rendersProducts: !isStop && !rendersItemsList && requirements.itemsMode === 'required',
    rendersReferenceNumber: requirements.referenceNumberMode !== 'off',
    rendersSignature: !isStop && requirements.signatureMode !== 'off',
  }
}

export {
  addOccurrencePhoto,
  listMissingOccurrenceRequirements,
  resolveDeclaredAmountTarget,
  resolveRequiredItemsCount,
  type OccurrenceDraftFacts,
  type OccurrenceMissingField,
  type OccurrenceValuesFacts,
} from './occurrenceMissingFields.service'
