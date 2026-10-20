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
import { resolveDriverOccurrenceTemplateKey } from '../domain/occurrence-notification.policy.js'
import {
  OccurrenceDuplicateRequestError,
  TripDocumentNotReachableError,
} from '../domain/trip.error.js'
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
  const {
    attachmentObjectIds,
    declaredAmount,
    lines,
    occurrenceType,
    referenceNumber,
    scope,
    signatureObjectId,
    tripId,
  } = await assessDriverOccurrence(input)
  const authorship = deriveFieldAuthorship(input)

  /**
   * Spec 179 T200: a chave de idempotência que esta rota não tinha (ADR-0045 §5, revisão de
   * arquitetura de 23/09). Reserva e escrita na **mesma transação** — o reenvio da fila offline
   * (Fase 3) não pode duplicar a ocorrência.
   */
  const occurrence = await input.unitOfWork.execute((transaction) =>
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
        const result = await saveOrRecallDuplicate(
          () =>
            transaction.saveDocumentOccurrence({
              actorUserId: input.actorUserId,
              attachmentObjectId: attachmentObjectIds[0] ?? null,
              attachmentObjectIds,
              authorship,
              companyId: input.companyId,
              declaredAmount,
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
              referenceNumber,
              signatureObjectId,
              stage: TRIP_OCCURRENCE_STAGE.delivery,
              tripId,
              typeName: occurrenceType.name,
            }),
          (occurrenceId) =>
            transaction.findDocumentOccurrenceById({ companyId: input.companyId, occurrenceId }),
        )
        if (result === null) throw new TripDocumentNotReachableError()

        return result
      },
      recall: (occurrenceId) =>
        transaction.findDocumentOccurrenceById({ companyId: input.companyId, occurrenceId }),
    }),
  )

  /**
   * Spec 275 (D1): depois do commit, sempre — sem olhar `notifies`. O reenvio da mesma chave chega aqui de novo e a
   * `dedupeKey` por ocorrência e destinatário segura a repetição. O aviso nunca derruba o registro (D6).
   */
  try {
    await input.notifier?.notify({
      companyId: input.companyId,
      documentId: input.documentId,
      occurrenceId: occurrence.id,
      occurrenceTypeId: occurrenceType.id,
      occurrenceTypeName: occurrenceType.name,
      templateKey: resolveDriverOccurrenceTemplateKey(occurrenceType.emailTemplateKey),
      tripId,
    })
  } catch {
    // Engolido de propósito: a ocorrência já está gravada.
  }

  return occurrence
}

/**
 * Spec 276 T4: o app não recebe erro pelo pedido repetido. A fila offline reenviaria para sempre o que o servidor recusa;
 * em vez disso a resposta é a ocorrência que já está aberta, e a chave de idempotência passa a apontar para ela.
 */
async function saveOrRecallDuplicate(
  save: () => Promise<DriverDocumentOccurrence | null>,
  recall: (occurrenceId: string) => Promise<DriverDocumentOccurrence | null>,
): Promise<DriverDocumentOccurrence | null> {
  try {
    return await save()
  } catch (error) {
    if (!(error instanceof OccurrenceDuplicateRequestError)) throw error
    return recall(error.existingOccurrenceId)
  }
}
