/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E1, E2, RF3): as "vagas de foto" do tipo da ocorrência de parada. Política pura: o caso de uso lê as
 * vagas do tipo e as fotos do corpo, e esta função decide — sem banco, sem storage.
 *
 * - Tipo **sem** vagas não aceita `photos` (a foto dele continua sendo o `attachmentObjectId` da spec 209).
 * - Vaga desconhecida, vaga repetida ou o mesmo upload em duas vagas é `400`.
 * - Vaga `required` sem foto é `422 STOP_OCCURRENCE_PHOTO_SLOT_MISSING` com a `slotKey` — só para o motorista: o
 *   escritório não tem o anexo da parada (spec 209), a mesma regra da foto da spec 315.
 */
import {
  StopOccurrencePhotoSlotInvalidError,
  StopOccurrencePhotoSlotMissingError,
} from './receiving-charge.error.js'

/** Uma vaga do tipo (`company_occurrence_type_photo_slots`). */
export type StopOccurrencePhotoSlot = {
  readonly label: string
  readonly position: number
  readonly required: boolean
  readonly slotKey: string
}

/** A foto que o corpo mandou para uma vaga: o upload confirmado da 179, nunca o arquivo. */
export type StopOccurrenceSlotPhotoInput = {
  readonly objectId: string
  readonly slotKey: string
}

/** A foto aceita, já com a posição da vaga — é o que vira linha em `trip_stop_occurrence_photos`. */
export type StopOccurrenceSlotPhoto = StopOccurrenceSlotPhotoInput & { readonly position: number }

export type ResolveStopOccurrencePhotosParams = {
  readonly isOffice: boolean
  readonly photos: readonly StopOccurrenceSlotPhotoInput[]
  readonly slots: readonly StopOccurrencePhotoSlot[]
}

const PHOTOS_FIELD = 'photos'

/** As fotos aceitas na ordem das vagas (`position`, depois `slotKey`). */
export function resolveStopOccurrencePhotos(
  params: ResolveStopOccurrencePhotosParams,
): readonly StopOccurrenceSlotPhoto[] {
  const { isOffice, photos, slots } = params
  const slotByKey = new Map(slots.map((slot) => [slot.slotKey, slot]))
  const seenSlots = new Set<string>()
  const seenObjects = new Set<string>()

  photos.forEach((photo, index) => {
    const field = `${PHOTOS_FIELD}.${String(index)}`
    if (!slotByKey.has(photo.slotKey)) {
      throw new StopOccurrencePhotoSlotInvalidError(`${field}.slotKey`, 'unknown_slot')
    }
    if (seenSlots.has(photo.slotKey)) {
      throw new StopOccurrencePhotoSlotInvalidError(`${field}.slotKey`, 'duplicate_slot')
    }
    if (seenObjects.has(photo.objectId)) {
      throw new StopOccurrencePhotoSlotInvalidError(`${field}.objectId`, 'duplicate_object')
    }
    seenSlots.add(photo.slotKey)
    seenObjects.add(photo.objectId)
  })

  const ordered = [...slots].sort(
    (left, right) =>
      left.position - right.position || left.slotKey.localeCompare(right.slotKey, 'en'),
  )
  if (!isOffice) {
    const missing = ordered.find((slot) => slot.required && !seenSlots.has(slot.slotKey))
    if (missing !== undefined) throw new StopOccurrencePhotoSlotMissingError(missing.slotKey)
  }

  return ordered.flatMap((slot) => {
    const photo = photos.find((candidate) => candidate.slotKey === slot.slotKey)
    return photo === undefined ? [] : [{ ...photo, position: slot.position }]
  })
}

/**
 * E2: `trip_stop_occurrences.attachment_object_id` continua preenchida com a foto da primeira vaga (a placa, na
 * cobrança no recebimento) — compatibilidade com quem já lê a coluna. O `attachmentObjectId` do corpo, quando
 * mandado, vence.
 */
export function resolveLegacyAttachmentObjectId(params: {
  readonly attachmentObjectId: null | string
  readonly photos: readonly StopOccurrenceSlotPhoto[]
}): null | string {
  return params.attachmentObjectId ?? params.photos[0]?.objectId ?? null
}
