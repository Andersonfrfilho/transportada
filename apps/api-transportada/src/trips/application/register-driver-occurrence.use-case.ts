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
import type { DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldTripLocator,
  type FieldTripTarget,
} from './field-trip-target.types.js'
import type { OccurrenceTypeRecord, TripOccurrence } from './register-trip-occurrence.use-case.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

/** Spec 179 T200: só as três leituras — a escrita passou a viver na transação da chave (T203). */
export type DriverOccurrenceReadPort = {
  findOccurrenceType(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<null | OccurrenceTypeRecord>
  /** `null` quando a nota não é de uma viagem ativa do alvo — inalcançável, não proibida. */
  findReachableDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  }): Promise<null | { readonly tripId: string }>
  listDocumentProducts(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly { readonly code: string; readonly description: string }[]>
}

const DOCUMENT_OCCURRENCE_OPERATION = 'document.occurrence'

export type RegisterDriverOccurrenceInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly idempotencyKey: string
  readonly note: string
  readonly occurrenceTypeId: string
  /** Vazio é a nota inteira: o motorista aponta o item quando o cliente recusou só parte. */
  readonly productCode: string
  readonly repository: DriverOccurrenceReadPort
  readonly unitOfWork: DriverFieldReportUnitOfWork
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
    target: toFieldTripTarget(input),
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

  const authorship = deriveFieldAuthorship(input)
  const tripId = reachable.tripId

  /**
   * Spec 179 T200: a chave de idempotência que esta rota não tinha (ADR-0045 §5, revisão de
   * arquitetura de 23/09). Reserva e escrita na **mesma transação** — o reenvio da fila offline
   * (Fase 3) não pode duplicar a ocorrência.
   */
  const saved = await input.unitOfWork.execute((transaction) =>
    withFieldReport<TripOccurrence>({
      guard: {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: resolveFieldReportOperation({
          locator: input,
          operation: DOCUMENT_OCCURRENCE_OPERATION,
        }),
        transaction,
      },
      perform: async () => {
        const result = await transaction.saveDocumentOccurrence({
          actorUserId: input.actorUserId,
          attachmentObjectId: null,
          authorship,
          companyId: input.companyId,
          documentId: input.documentId,
          note: input.note,
          occurrenceTypeId: occurrenceType.id,
          productCode: scope.productCode,
          stage: TRIP_OCCURRENCE_STAGE.delivery,
          tripId,
          typeName: occurrenceType.name,
        })
        if (result === null) throw new TripDocumentNotReachableError()

        return result
      },
      recall: (occurrenceId) =>
        transaction.findDocumentOccurrenceById({ companyId: input.companyId, occurrenceId }),
    }),
  )

  return saved
}
