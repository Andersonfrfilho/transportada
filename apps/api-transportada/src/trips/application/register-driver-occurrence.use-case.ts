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
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotReachableError } from '../domain/trip.error.js'
import { resolveOccurrenceProductScope } from '../domain/occurrence-scope.policy.js'
import type { OccurrenceTypeRecord, TripOccurrence } from './register-trip-occurrence.use-case.js'

export type DriverOccurrencePort = {
  findOccurrenceType(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<null | OccurrenceTypeRecord>
  /** `null` quando a nota não é de uma viagem ativa deste motorista — inalcançável, não proibida. */
  findReachableDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }): Promise<null | { readonly tripId: string }>
  listDocumentProducts(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly { readonly code: string; readonly description: string }[]>
  saveOccurrence(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly stage: 'delivery'
    readonly tripId: string
    readonly typeName: string
  }): Promise<null | TripOccurrence>
}

export type RegisterDriverOccurrenceInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
  readonly note: string
  readonly occurrenceTypeId: string
  /** Vazio é a nota inteira: o motorista aponta o item quando o cliente recusou só parte. */
  readonly productCode: string
  readonly repository: DriverOccurrencePort
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
  const occurrenceType = await input.repository.findOccurrenceType({
    companyId: input.companyId,
    occurrenceTypeId: input.occurrenceTypeId,
  })

  /**
   * ⚠️ Tipo de galpão, tipo aposentado, tipo de outra empresa e nota fora da viagem dele respondem
   * **igual**: inalcançável. Distinguir os quatro diria a quem tenta qual barreira encontrou.
   */
  if (
    occurrenceType === null ||
    !occurrenceType.active ||
    occurrenceType.stage !== TRIP_OCCURRENCE_STAGE.delivery
  ) {
    throw new TripDocumentNotReachableError()
  }

  const reachable = await input.repository.findReachableDocument({
    companyId: input.companyId,
    documentId: input.documentId,
    driverId: input.driverId,
  })
  if (reachable === null) throw new TripDocumentNotReachableError()

  const scope = resolveOccurrenceProductScope({
    productCode: input.productCode,
    products: await input.repository.listDocumentProducts({
      companyId: input.companyId,
      documentId: input.documentId,
      tripId: reachable.tripId,
    }),
  })
  if (scope === null) throw new TripDocumentNotReachableError()

  const saved = await input.repository.saveOccurrence({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    documentId: input.documentId,
    note: input.note,
    occurrenceTypeId: occurrenceType.id,
    productCode: scope.productCode,
    stage: TRIP_OCCURRENCE_STAGE.delivery,
    tripId: reachable.tripId,
    typeName: occurrenceType.name,
  })
  if (saved === null) throw new TripDocumentNotReachableError()

  return saved
}
