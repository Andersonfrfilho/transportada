/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T7: o despacho, no worker, do retorno do boleto ao grupo do pedido (`dispatchWhatsAppGroupBoletoReturns`),
 * pelo mesmo Evolution do envio ao cliente. Roda depois do despacho do WhatsApp do cliente (para saber se ele recebeu)
 * e na batida do alarme do retorno vencido (sem empresa: todas). Nunca lança; o log leva só contagens.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { ContractorReplyClientWhatsAppDispatcherPort } from '../application/contractor-reply-client-whatsapp.port.js'
import {
  dispatchWhatsAppGroupBoletoReturns,
  type GroupBoletoReturnSender,
} from './whatsapp-group-boleto-return.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type WhatsAppGroupBoletoReturnDispatcher = {
  dispatch(params: { readonly companyId?: string }): Promise<void>
}

export function createWhatsAppGroupBoletoReturnDispatcher(dependencies: {
  readonly database: Database
  readonly logger: WorkerLogger
  readonly now?: () => Date
  readonly readAttachment: (params: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array>
  readonly sender: GroupBoletoReturnSender
}): WhatsAppGroupBoletoReturnDispatcher {
  return {
    async dispatch({ companyId }) {
      try {
        const result = await dispatchWhatsAppGroupBoletoReturns(
          {
            readAttachment: dependencies.readAttachment,
            runner: dependencies.database,
            sender: dependencies.sender,
          },
          {
            ...(companyId === undefined ? {} : { companyId }),
            now: dependencies.now?.() ?? new Date(),
          },
        )
        if (result.sent > 0 || result.failed > 0) {
          safeLogInfo({
            logger: dependencies.logger,
            message: 'whatsapp_group_request_boleto_return',
            metadata: { companyId: companyId ?? null, ...result },
          })
        }
      } catch (error) {
        safeLogWarn({
          logger: dependencies.logger,
          message: 'whatsapp_group_request_boleto_return_failed',
          metadata: {
            companyId: companyId ?? null,
            error: error instanceof Error ? error.name : 'unknown',
          },
        })
      }
    },
  }
}

/** O despacho do cliente e, logo depois, o do grupo: o grupo só sabe se o cliente recebeu depois do primeiro. */
export function chainContractorReplyDispatchers(
  ...dispatchers: readonly ContractorReplyClientWhatsAppDispatcherPort[]
): ContractorReplyClientWhatsAppDispatcherPort {
  return {
    async dispatch(params) {
      for (const dispatcher of dispatchers) await dispatcher.dispatch(params)
    },
  }
}
