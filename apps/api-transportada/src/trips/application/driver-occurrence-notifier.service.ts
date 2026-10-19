/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 275: o aviso interno da ocorrência que o motorista registra numa nota — para os responsáveis (lista efetiva da
 * 267/271) e quem despachou a viagem. Reverte o "sem notificador" da 079: o registro do app **é** o relato, e quem
 * trata a ocorrência nem sempre é quem despachou.
 */
import { NOTIFICATION_CATEGORY } from '../../notification/domain/notification-catalog.constant.js'
import { resolveEffectiveWatchers } from '../../contractor-mail/domain/occurrence-watcher.policy.js'
import type { OccurrenceWatcherCandidate } from '../../contractor-mail/domain/occurrence-watcher.policy.js'
import { resolveDriverOccurrenceRecipients } from '../domain/occurrence-notification.policy.js'

type Logger = { warn(event: string, meta?: Record<string, unknown>): void }

export type DriverOccurrenceNotification = {
  readonly companyId: string
  readonly documentId: string
  readonly occurrenceId: string
  readonly occurrenceTypeId: string
  readonly occurrenceTypeName: string
  readonly templateKey: string
  readonly tripId: string
}

export type DriverOccurrenceNotifierPort = {
  notify(input: DriverOccurrenceNotification): Promise<void>
}

export type DriverOccurrenceNotificationReader = {
  /** O último despacho da viagem (a cancelada e redespachada tem dois), como no aviso da 079. */
  findDispatcherUserId(params: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | string>
  /** As três listas da 271 com a contratante da nota; nota sem contratante cadastrada tem a lista dela vazia. */
  findWatcherCandidates(params: {
    readonly companyId: string
    readonly documentId: string
    readonly occurrenceTypeId: string
  }): Promise<{
    readonly company: readonly OccurrenceWatcherCandidate[]
    readonly contractor: readonly OccurrenceWatcherCandidate[]
    readonly type: readonly OccurrenceWatcherCandidate[]
  }>
  readLabels(params: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<{ readonly documentLabel: string; readonly stopLabel: string }>
}

type SendNotification = (input: {
  readonly category: string
  readonly companyId: string
  readonly dedupeKey: string
  readonly payload: object
  readonly recipientUserId: string
  readonly templateKey: string
}) => Promise<unknown>

/**
 * ⚠️ **O aviso nunca derruba o registro** (a regra de `notifyOccurrence`): leitura ou envio que falha vira `warn` com
 * ids e contagens — nunca nome nem endereço. Um destinatário que falha não impede os outros.
 */
export function createDriverOccurrenceNotifier(input: {
  readonly logger: Logger
  readonly reader: DriverOccurrenceNotificationReader
  readonly send: SendNotification
}): DriverOccurrenceNotifierPort {
  return {
    async notify(notification) {
      const { companyId, documentId, occurrenceId, templateKey, tripId } = notification
      try {
        const [dispatcherUserId, candidates, labels] = await Promise.all([
          input.reader.findDispatcherUserId({ companyId, tripId }),
          input.reader.findWatcherCandidates({
            companyId,
            documentId,
            occurrenceTypeId: notification.occurrenceTypeId,
          }),
          input.reader.readLabels({ companyId, documentId, tripId }),
        ])
        /** A lista efetiva da 267 RF3, sem regra nova: vínculo ativo, `occurrences.resolve`, com e-mail, sem duplicata. */
        const watchers = resolveEffectiveWatchers({
          companyWatchers: candidates.company,
          contractorWatchers: candidates.contractor,
          excludedUserIds: [],
          toAddresses: [],
          typeWatchers: candidates.type,
        })
        const recipients = resolveDriverOccurrenceRecipients({
          dispatcherUserId,
          watcherUserIds: watchers.copy.map((watcher) => watcher.userId),
        })
        const results = await Promise.allSettled(
          recipients.map((recipientUserId) =>
            input.send({
              category: NOTIFICATION_CATEGORY.TRIP,
              companyId,
              /** D5: o índice único do módulo é `(company_id, dedupe_key)` — a chave carrega o destinatário. */
              dedupeKey: `${templateKey}:${occurrenceId}:${recipientUserId}`,
              payload: {
                documentLabel: labels.documentLabel,
                occurrenceType: notification.occurrenceTypeName,
                stopLabel: labels.stopLabel,
              },
              recipientUserId,
              templateKey,
            }),
          ),
        )
        const rejected = results.filter((result) => result.status === 'rejected')
        if (rejected.length > 0) {
          const [first] = rejected
          input.logger.warn('driver_occurrence_notification_partial', {
            companyId,
            failed: rejected.length,
            occurrenceId,
            reason: first?.reason instanceof Error ? first.reason.message : 'unknown',
            recipients: recipients.length,
            tripId,
          })
        }
      } catch (error) {
        input.logger.warn('driver_occurrence_notification_failed', {
          companyId,
          occurrenceId,
          reason: error instanceof Error ? error.message : 'unknown',
          tripId,
        })
      }
    },
  }
}
