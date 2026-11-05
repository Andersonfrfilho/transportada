/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T7: o despacho, na API, do retorno do boleto ao grupo do pedido (`dispatchWhatsAppGroupBoletoReturns`), pelo
 * mesmo Evolution do envio ao cliente. Roda depois do despacho do WhatsApp do cliente, para saber se ele recebeu. Nunca
 * lança; o log leva só contagens.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { ContractorReplyClientWhatsAppDispatcherPort } from '../application/contractor-reply-client-whatsapp.port.js'
import {
  dispatchWhatsAppGroupBoletoReturns,
  type GroupBoletoReturnSender,
} from './whatsapp-group-boleto-return.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type WhatsAppGroupBoletoReturnDispatcherLogger = {
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
}

export function createWhatsAppGroupBoletoReturnDispatcher(dependencies: {
  readonly database: Database
  readonly logger: WhatsAppGroupBoletoReturnDispatcherLogger
  readonly now?: () => Date
  readonly readAttachment: (params: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array>
  readonly sender: GroupBoletoReturnSender
}): ContractorReplyClientWhatsAppDispatcherPort {
  return {
    async dispatch({ companyId }) {
      try {
        const result = await dispatchWhatsAppGroupBoletoReturns(
          {
            readAttachment: dependencies.readAttachment,
            runner: dependencies.database,
            sender: dependencies.sender,
          },
          { companyId, now: dependencies.now?.() ?? new Date() },
        )
        if (result.sent > 0 || result.failed > 0) {
          dependencies.logger.info('whatsapp_group_request.boleto_return', { companyId, ...result })
        }
      } catch (error) {
        dependencies.logger.warn('whatsapp_group_request.boleto_return_failed', {
          companyId,
          error: error instanceof Error ? error.name : 'unknown',
        })
      }
    },
  }
}

/**
 * A entrega do operador ao motorista e, depois dela, o retorno ao grupo do pedido sem segurar a resposta HTTP (o ritmo
 * do número pode esperar minutos). O despacho nunca lança.
 */
export function withGroupBoletoReturn<
  TUseCase extends {
    deliver(input: { readonly companyId: string } & Record<string, unknown>): Promise<unknown>
  },
>(useCase: TUseCase, groupReturns: ContractorReplyClientWhatsAppDispatcherPort): TUseCase {
  return {
    ...useCase,
    deliver: async (input: Parameters<TUseCase['deliver']>[0]) => {
      const outcome = await useCase.deliver(input)
      void groupReturns.dispatch({ companyId: input.companyId })
      return outcome
    },
  }
}
