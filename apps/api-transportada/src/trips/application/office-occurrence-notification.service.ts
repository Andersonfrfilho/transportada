/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (D7), T15 M10: os avisos do lote de ocorrências, depois do commit.
 */
import type {
  BatchOutcome,
  OccurrenceLabels,
  RegisterOfficeDocumentOccurrencesParams,
} from './office-occurrence-batch.types.js'
import { notifyOccurrence } from './register-trip-occurrence.use-case.js'

/** Rótulo ausente vira lacuna no template: melhor aviso com buraco do que nenhum aviso. */
const EMPTY_OCCURRENCE_LABELS: OccurrenceLabels = { documentLabel: '', stopLabel: '' }

/**
 * Um aviso por nota **criada nesta chamada**, depois do commit e fora da transação. A regra (tipo
 * com aviso ligado, destinatário, falha do envio engolida) é a de `notifyOccurrence`, sem cópia. Os
 * avisos vão para quem despachou a viagem (ressalva M4).
 *
 * Spec 156 T15 M10: os rótulos saem de uma leitura só, e a falha dela (ou de qualquer passo daqui)
 * não vira 500 — as ocorrências já estão gravadas, e o reenvio da mesma chave não avisaria de novo.
 */
export async function notifyCreated(input: {
  readonly outcome: BatchOutcome
  readonly params: RegisterOfficeDocumentOccurrencesParams
}): Promise<void> {
  const { occurrenceType } = input.outcome
  if (occurrenceType === null) return

  const { params } = input
  const created = input.outcome.items.filter((item) => item.createdNow)
  if (created.length === 0) return

  try {
    const labels = await params.notifications.readLabels({
      companyId: params.companyId,
      documentIds: created.map((item) => item.documentId),
      tripId: params.target.tripId,
    })
    await Promise.all(
      created.map((item) =>
        notifyOccurrence({
          companyId: params.companyId,
          notificationParameters: {
            ...(labels.get(item.documentId) ?? EMPTY_OCCURRENCE_LABELS),
            documentId: item.documentId,
            occurrenceType: '',
            tripId: params.target.tripId,
          },
          notifier: params.notifications.notifier,
          occurrenceType,
        }),
      ),
    )
  } catch (error) {
    params.notifications.logger.warn('trip_office_occurrences_notification_failed', {
      companyId: params.companyId,
      reason: error instanceof Error ? error.message : 'unknown',
      tripId: params.target.tripId,
    })
  }
}
