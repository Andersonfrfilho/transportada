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
import { assessDriverOccurrence } from './driver-occurrence-assessment.service.js'
import { resolveFieldTapLocationStamp } from './field-tap-location-stamp.service.js'
import { deriveFieldAuthorship } from './field-trip-target.types.js'
import type { DriverDocumentOccurrence } from './driver-document-occurrence.types.js'
import type { RegisterDriverOccurrenceInput } from './register-driver-occurrence.types.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

export type {
  DriverOccurrenceReadPort,
  RegisterDriverOccurrenceInput,
} from './register-driver-occurrence.types.js'

const DOCUMENT_OCCURRENCE_OPERATION = 'document.occurrence'

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
): Promise<DriverDocumentOccurrence> {
  const { attachmentObjectIds, lines, occurrenceType, scope, signatureObjectId, tripId } =
    await assessDriverOccurrence(input)
  const authorship = deriveFieldAuthorship(input)

  /**
   * Spec 179 T200: a chave de idempotência que esta rota não tinha (ADR-0045 §5, revisão de
   * arquitetura de 23/09). Reserva e escrita na **mesma transação** — o reenvio da fila offline
   * (Fase 3) não pode duplicar a ocorrência.
   */
  return input.unitOfWork.execute((transaction) =>
    withFieldReport<DriverDocumentOccurrence>({
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
          attachmentObjectId: attachmentObjectIds[0] ?? null,
          attachmentObjectIds,
          authorship,
          companyId: input.companyId,
          declaredAmount: input.declaredAmount ?? null,
          documentId: input.documentId,
          items: lines.map((line) => ({
            declaredAmount: line.declaredAmount,
            productCode: line.productCode,
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            unitValue: line.unitValue,
          })),
          locationStamp: resolveFieldTapLocationStamp({
            location: input.location,
            locator: input,
          }),
          note: input.note,
          occurrenceTypeId: occurrenceType.id,
          productCode: scope.productCode,
          referenceNumber: input.referenceNumber ?? null,
          signatureObjectId,
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
}
