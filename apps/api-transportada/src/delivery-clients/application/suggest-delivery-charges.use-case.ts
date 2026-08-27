/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryChargeOrigin, DeliveryChargeType } from '../../database/delivery-client.schema.js'
import type {
  DeliveryChargeRepositoryPort,
  DeliveryChargeRuleRepositoryPort,
} from './delivery-charge.port.js'

export type SuggestDeliveryChargesPort = {
  /** Nunca lança: a entrega já aconteceu, e nada aqui pode desfazê-la. */
  onDelivered(input: {
    readonly chargeType?: DeliveryChargeType
    readonly companyId: string
    readonly deliveredOn: string
    readonly origin?: Extract<DeliveryChargeOrigin, 'occurrence' | 'recurring'>
    readonly tripDocumentId: string
  }): Promise<void>
}

export type SuggestDeliveryChargesLogger = {
  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void
}

/**
 * Spec 060 D4b: **a regra propõe, gente lança.** Toda entrega concluída num cliente com regra
 * recorrente gera a sugestão já preenchida; um toque de confirmação a leva a `recorded`.
 *
 * A sugestão nasce `suggested` e não `recorded` pela razão inteira de a regra existir com segurança:
 * o valor muda, a entrega às vezes não gera a cobrança (o motorista descarregou na doca livre), e o
 * lançamento é dinheiro cobrado de outra empresa. Uma regra que escrevesse direto em `recorded`
 * produziria, seis meses depois, um relatório com taxas que ninguém pagou.
 *
 * **A falha aqui nunca desfaz a entrega.** O motorista está na porta do cliente; recusar a entrega
 * porque a sugestão de taxa não gravou seria trocar o essencial pelo acessório.
 */
export function createSuggestDeliveryCharges(dependencies: {
  readonly charges: DeliveryChargeRepositoryPort
  readonly logger: SuggestDeliveryChargesLogger
  readonly rules: DeliveryChargeRuleRepositoryPort
}): SuggestDeliveryChargesPort {
  return {
    async onDelivered(input) {
      try {
        const parties = await dependencies.charges.findChargeParties({
          companyId: input.companyId,
          tripDocumentId: input.tripDocumentId,
        })
        if (parties === null) return

        const rules = await dependencies.rules.listActiveByClient({
          companyId: input.companyId,
          deliveryClientId: parties.deliveryClientId,
        })
        const matching =
          input.chargeType === undefined
            ? rules
            : rules.filter((rule) => rule.chargeType === input.chargeType)
        /**
         * Spec 060 D4c: a ocorrência do motorista **sempre** vira sugestão, com ou sem regra — ele
         * viu cobrarem, e o recibo está na foto. Sem regra ela nasce **sem valor**, e a confirmação
         * recusa até alguém preenchê-lo. Perder o aviso por não saber o número seria jogar fora
         * justamente o que o campo tem a dizer.
         */
        const wanted =
          matching.length > 0 || input.origin !== 'occurrence' || input.chargeType === undefined
            ? matching
            : [
                {
                  active: true,
                  chargeType: input.chargeType,
                  deliveryClientId: parties.deliveryClientId,
                  expectedAmount: '0',
                  id: '',
                },
              ]

        for (const rule of wanted) {
          /**
           * `insert` devolve `null` quando o índice parcial recusa a segunda sugestão da mesma nota
           * e tipo — a ocorrência do motorista e a regra propondo a mesma taxa. Uma sugestão, uma
           * conferência (D4c).
           */
          await dependencies.charges.insert({
            actorUserId: null,
            charge: {
              amount: rule.expectedAmount,
              chargedOn: input.deliveredOn,
              chargeType: rule.chargeType,
              notes: '',
              origin: input.origin ?? 'recurring',
              parties,
              status: 'suggested',
              tripDocumentId: input.tripDocumentId,
            },
            companyId: input.companyId,
          })
        }
      } catch (error) {
        dependencies.logger.warn('delivery_charge_suggestion_failed', {
          companyId: input.companyId,
          reason: error instanceof Error ? error.message : 'unknown',
          tripDocumentId: input.tripDocumentId,
        })
      }
    },
  }
}
