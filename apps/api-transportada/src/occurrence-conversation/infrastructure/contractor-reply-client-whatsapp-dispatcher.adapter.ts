/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3 (RF3/RF4): o despacho, na API, das entregas automáticas por WhatsApp que a transação reservou
 * (`dispatchContractorReplyClientWhatsApp`), pelo mesmo Evolution do envio manual da 281. O log leva só contagens.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { ContractorReplyClientWhatsAppDispatcherPort } from '../application/contractor-reply-client-whatsapp.port.js'
import {
  dispatchContractorReplyClientWhatsApp,
  type ContractorReplyClientWhatsAppSender,
} from './contractor-reply-client-whatsapp-forward.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type ContractorReplyClientWhatsAppDispatcherLogger = {
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
}

export function createContractorReplyClientWhatsAppDispatcher(dependencies: {
  readonly database: Database
  readonly logger: ContractorReplyClientWhatsAppDispatcherLogger
  readonly readAttachment: (params: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array>
  readonly sender: ContractorReplyClientWhatsAppSender
}): ContractorReplyClientWhatsAppDispatcherPort {
  return {
    async dispatch({ companyId }) {
      try {
        const result = await dispatchContractorReplyClientWhatsApp(
          {
            readAttachment: dependencies.readAttachment,
            runner: dependencies.database,
            sender: dependencies.sender,
            transaction: (operation) => dependencies.database.transaction(operation),
          },
          { companyId },
        )
        if (result.sent > 0 || result.failed > 0) {
          dependencies.logger.info('occurrence_contractor_reply_whatsapp_automatic', {
            companyId,
            ...result,
          })
        }
      } catch (error) {
        dependencies.logger.warn('occurrence_contractor_reply_whatsapp_automatic_failed', {
          companyId,
          error: error instanceof Error ? error.name : 'unknown',
        })
      }
    },
  }
}
