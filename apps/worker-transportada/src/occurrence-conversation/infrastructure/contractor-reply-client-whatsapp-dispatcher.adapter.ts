/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3 (RF3/RF4): o despacho, no worker, das entregas automáticas por WhatsApp que a transação da resposta da
 * contratante reservou (`dispatchContractorReplyClientWhatsApp`). O log leva só contagens.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { ContractorReplyClientWhatsAppDispatcherPort } from '../application/contractor-reply-client-whatsapp.port.js'
import {
  dispatchContractorReplyClientWhatsApp,
  type ContractorReplyClientWhatsAppSender,
} from './contractor-reply-client-whatsapp-forward.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createContractorReplyClientWhatsAppDispatcher(dependencies: {
  readonly database: Database
  readonly logger: WorkerLogger
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
          safeLogInfo({
            logger: dependencies.logger,
            message: 'occurrence_contractor_reply_whatsapp_automatic',
            metadata: { companyId, ...result },
          })
        }
      } catch (error) {
        safeLogWarn({
          logger: dependencies.logger,
          message: 'occurrence_contractor_reply_whatsapp_automatic_failed',
          metadata: { companyId, error: error instanceof Error ? error.name : 'unknown' },
        })
      }
    },
  }
}
