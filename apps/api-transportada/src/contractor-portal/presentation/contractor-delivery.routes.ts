/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0050 §4: **o servidor decide o que é do cliente.** A rota não recebe id de nada — nem de nota,
 * nem de viagem, nem de contratante —, e por isso não existe BOLA a testar aqui: não há objeto que o
 * cliente possa nomear.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_CLIENT_DELIVERIES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ContractorDelivery } from '../application/contractor-portal.types.js'

const TRACK_POLICY = { permission: 'deliveries.track', scope: 'company' } as const

export type ContractorDeliveryRoutesDependencies = {
  readonly listDeliveries: {
    execute(input: { readonly context: CompanyContext }): Promise<readonly ContractorDelivery[]>
  }
}

export function createContractorDeliveryRoutes(
  dependencies: ContractorDeliveryRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const deliveries = await dependencies.listDeliveries.execute({ context: context.scope })

        return new Response(JSON.stringify({ data: deliveries.map(serialize) }), {
          headers: { 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'GET',
      /** Nem query: filtrar por documento é a única coisa que esta rota nunca vai oferecer. */
      parse: () => ({}) as Record<string, never>,
      pathname: API_CLIENT_DELIVERIES_PATH,
      policy: TRACK_POLICY,
    }),
  ]
}

/**
 * O **payload mínimo**, e ele é uma lista fechada por escolha. O que fica de fora, e por quê:
 *
 * - **id interno** de nota, de viagem e de vínculo — a chave de acesso já identifica a nota para
 *   quem é dono dela, e um UUID nosso na mão do cliente é um identificador para ele tentar em outra
 *   rota no dia em que alguma aceitar id;
 * - **motorista, placa e roteiro** — é a operação da transportadora, não a carga do cliente. Saber
 *   que a mesma carreta leva a carga do concorrente é informação comercial de graça;
 * - **valor de frete** — o que o contratante paga está na fatura dele, não no acompanhamento.
 */
function serialize(delivery: ContractorDelivery): Record<string, unknown> {
  return {
    accessKey: delivery.accessKey,
    deliveredAt: delivery.deliveredAt,
    estimatedArrivalAt: delivery.estimatedArrivalAt,
    issuedAt: delivery.issuedAt,
    number: delivery.number,
    returnReason: delivery.returnReason,
    separationStatus: delivery.separationStatus,
    series: delivery.series,
    tripStatus: delivery.tripStatus,
  }
}
