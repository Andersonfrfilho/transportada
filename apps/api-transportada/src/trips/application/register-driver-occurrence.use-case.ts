/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: o motorista registra a ocorrência do próprio celular.
 *
 * ⚠️ **Esta é a rota que faltava** — e ela mora na árvore `/me` por um motivo medido: em 02/09 uma
 * versão dela nasceu em `/trips/:id` pedindo `trip.report`, e `test/driver-trip/me-routes.contract.ts`
 * reprovou. O motorista tem `trip.report` para **toda a empresa**; numa rota que recebe o id da
 * viagem, ele alcançaria qualquer viagem. Aqui não há id de viagem no caminho: o escopo é a viagem
 * ativa dele, e quem o garante é a consulta, não a permissão.
 */
import {
  resolveOccurrenceStage,
  TRIP_OCCURRENCE_STAGE,
} from '../../shared/trip-occurrence.constant.js'
import type { TripOccurrenceType } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotReachableError } from '../domain/trip.error.js'
import type { TripOccurrence } from './register-trip-occurrence.use-case.js'

export type DriverOccurrencePort = {
  /** `null` quando a nota não é de uma viagem ativa deste motorista — inalcançável, não proibida. */
  findReachableDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }): Promise<null | { readonly tripId: string }>
  saveOccurrence(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly productCode: string
    readonly stage: 'delivery'
    readonly tripId: string
    readonly type: TripOccurrenceType
  }): Promise<null | TripOccurrence>
}

export type RegisterDriverOccurrenceInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
  readonly note: string
  readonly repository: DriverOccurrencePort
  readonly type: string
}

/**
 * ⚠️ **O motorista registra só o que acontece na rua.** `item_faltante` é do galpão — ele não
 * separou a carga —, e aceitar isso dele apagaria a linha que a ADR-0043 traçou entre barracão e
 * rua, a mesma que decide quem pode o quê no resto do produto.
 *
 * Tipo de galpão e nota fora da viagem dele respondem **igual**: inalcançável. Distinguir os dois
 * diria a quem tenta qual das duas barreiras ele encontrou.
 */
export async function registerDriverOccurrence(
  input: RegisterDriverOccurrenceInput,
): Promise<TripOccurrence> {
  if (resolveOccurrenceStage(input.type) !== TRIP_OCCURRENCE_STAGE.delivery) {
    throw new TripDocumentNotReachableError()
  }

  const reachable = await input.repository.findReachableDocument({
    companyId: input.companyId,
    documentId: input.documentId,
    driverId: input.driverId,
  })
  if (reachable === null) throw new TripDocumentNotReachableError()

  const saved = await input.repository.saveOccurrence({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    documentId: input.documentId,
    note: input.note,
    productCode: '',
    stage: TRIP_OCCURRENCE_STAGE.delivery,
    tripId: reachable.tripId,
    type: input.type as TripOccurrenceType,
  })
  if (saved === null) throw new TripDocumentNotReachableError()

  return saved
}
