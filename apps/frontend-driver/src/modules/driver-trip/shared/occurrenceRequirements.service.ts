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

export type OccurrenceRequirements = Readonly<{
  itemsMode: ProofFieldRequirement
  noteMode: ProofFieldRequirement
  photoMinimumCount: number
  photoMode: ProofFieldRequirement
  signatureMode: ProofFieldRequirement
}>

/**
 * D-d da 246: a ocorrência de **parada** não lê exigência no servidor além da foto (que o app já
 * cobrava desde a 209). Nota, assinatura e produtos só valem para o tipo de nota — cobrar a
 * observação de uma parada no aparelho seria recusar o que o servidor aceita.
 */
const STOP_REQUIREMENTS = {
  itemsMode: 'off',
  noteMode: 'optional',
  photoMinimumCount: DEFAULT_PHOTO_MINIMUM_COUNT,
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
    itemsMode: type.itemsMode ?? 'optional',
    noteMode: type.noteMode ?? 'optional',
    photoMinimumCount: readPhotoMinimumCount(type),
    photoMode,
    signatureMode: type.signatureMode ?? 'off',
  }
}

export type OccurrenceFieldVisibility = Readonly<{
  /** Quantas fotos o formulário aceita: uma, ou até o teto quando o tipo exige mais de uma. */
  photoLimit: number
  rendersNote: boolean
  rendersPhoto: boolean
  /** Sem lista de itens no snapshot, o app só aponta a nota inteira — e só quando é exigido. */
  rendersProducts: boolean
  rendersSignature: boolean
}>

export function resolveOccurrenceFieldVisibility(
  type: DriverOccurrenceType,
): OccurrenceFieldVisibility {
  const requirements = resolveOccurrenceRequirements(type)
  const isStop = type.flow === 'stop'
  const asksManyPhotos = requirements.photoMode === 'required' && requirements.photoMinimumCount > 1
  return {
    photoLimit: !isStop && asksManyPhotos ? OCCURRENCE_PHOTO_MAXIMUM_COUNT : 1,
    rendersNote: isStop || requirements.noteMode !== 'off',
    rendersPhoto: requirements.photoMode !== 'off',
    rendersProducts: !isStop && requirements.itemsMode === 'required',
    rendersSignature: !isStop && requirements.signatureMode !== 'off',
  }
}

/** `photoMinimum` é a foto que já existe, mas não chega ao mínimo — o texto diz quantas faltam. */
export type OccurrenceMissingField = 'note' | 'photo' | 'photoMinimum' | 'products' | 'signature'

export type OccurrenceDraftFacts = Readonly<{
  hasNote: boolean
  hasProducts: boolean
  hasSignature: boolean
  photoCount: number
}>

function listMissingPhotoField(input: {
  readonly photoCount: number
  readonly requirements: OccurrenceRequirements
}): readonly OccurrenceMissingField[] {
  const { photoCount, requirements } = input
  if (requirements.photoMode !== 'required') return []
  if (photoCount === 0) return ['photo']
  return photoCount < requirements.photoMinimumCount ? ['photoMinimum'] : []
}

/** Quem falta, na ordem em que o formulário pergunta. `off` e `optional` nunca faltam. */
export function listMissingOccurrenceRequirements(input: {
  readonly facts: OccurrenceDraftFacts
  readonly requirements: OccurrenceRequirements
}): readonly OccurrenceMissingField[] {
  const { facts, requirements } = input
  return [
    ...(requirements.noteMode === 'required' && !facts.hasNote ? (['note'] as const) : []),
    ...(requirements.itemsMode === 'required' && !facts.hasProducts ? (['products'] as const) : []),
    ...listMissingPhotoField({ photoCount: facts.photoCount, requirements }),
    ...(requirements.signatureMode === 'required' && !facts.hasSignature
      ? (['signature'] as const)
      : []),
  ]
}

/**
 * Spec 246 (RF1c): a foto escolhida entra na lista. Com limite 1 (o que o app sempre fez) ela
 * **substitui**; com mais de uma, acrescenta até o teto — a lista cheia não aceita a próxima.
 */
export function addOccurrencePhoto<TPhoto>(input: {
  readonly current: readonly TPhoto[]
  readonly limit: number
  readonly photo: TPhoto
}): readonly TPhoto[] {
  if (input.limit <= 1) return [input.photo]
  if (input.current.length >= input.limit) return input.current
  return [...input.current, input.photo]
}
