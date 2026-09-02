/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T020: registrar o que houve com um item da carga.
 */
import type {
  TripOccurrenceStage,
  TripOccurrenceType,
} from '../../shared/trip-occurrence.constant.js'
import { resolveOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'

export type TripOccurrence = {
  readonly createdAt: string
  readonly id: string
  readonly note: string
  readonly productCode: string
  readonly stage: TripOccurrenceStage
  readonly type: TripOccurrenceType
}

export type TripOccurrencePort = {
  listOccurrences(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly TripOccurrence[]>
  /** `null` quando a nota não é desta viagem nesta empresa — ausência, nunca escrita às cegas. */
  saveOccurrence(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly productCode: string
    readonly stage: TripOccurrenceStage
    readonly tripId: string
    readonly type: TripOccurrenceType
  }): Promise<null | TripOccurrence>
}

export type RegisterTripOccurrenceInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly note: string
  readonly productCode: string
  readonly repository: TripOccurrencePort
  readonly tripId: string
  readonly type: TripOccurrenceType
}

/**
 * ⚠️ **Só anota.** Não muda `separation_status`, não bloqueia transição, não impede despacho.
 * Misturar o estado da nota com o que houve com ela deixaria o operador sem saída, porque não
 * existe tela de resolução de ocorrência — e a nota ficaria travada num estado que ninguém sabe
 * destravar. Quando essa tela existir, o bloqueio é decisão nova, por escrito.
 *
 * O grupo é **derivado do tipo**, nunca aceito do cliente: aceitá-lo no corpo deixaria quem tem
 * `trip.manage` declarar que uma ocorrência de rua é de galpão para caber na própria permissão.
 */
export async function registerTripOccurrence({
  actorUserId,
  companyId,
  documentId,
  note,
  productCode,
  repository,
  tripId,
  type,
}: RegisterTripOccurrenceInput): Promise<TripOccurrence> {
  const stage = resolveOccurrenceStage(type)
  if (stage === null) throw new TripDocumentNotFoundError()

  const saved = await repository.saveOccurrence({
    actorUserId,
    companyId,
    documentId,
    note,
    productCode,
    stage,
    tripId,
    type,
  })
  if (saved === null) throw new TripDocumentNotFoundError()
  return saved
}
