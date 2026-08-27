/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0050 §4: **o servidor decide o que é do cliente.** A rota não recebe id de nada — nem de nota,
 * nem de viagem, nem de contratante —, e por isso não existe BOLA a testar aqui: não há objeto que o
 * cliente possa nomear.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { CHAVE_PATTERN } from '../../shared/tax-id.service.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import type { TripStopSchedule } from '../../delivery-clients/application/trip-stop-schedule.use-case.js'
import { API_CLIENT_DELIVERIES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ContractorDelivery } from '../application/contractor-portal.types.js'

const TRACK_POLICY = { permission: 'deliveries.track', scope: 'company' } as const

const DELIVERY_SCHEDULE_PATH = `${API_CLIENT_DELIVERIES_PATH}/:accessKey/schedule`

/**
 * O contratante confirma a janela dele ou recusa a data — `pending` e `requested` são movimentos da
 * transportadora (é ela que pede), e oferecê-los aqui deixaria o portal escrever pendência em nome
 * de quem deveria resolvê-la.
 */
const CLIENT_SCHEDULE_STATUSES = ['confirmed', 'refused'] as const

const scheduleSchema = z
  .object({
    notes: z.string().trim().max(2000).optional(),
    /** O protocolo é o número que o sistema do cliente devolve — e ele viaja até o motorista. */
    protocol: z.string().trim().max(100).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    status: z.enum(CLIENT_SCHEDULE_STATUSES),
  })
  .strict()

export type ContractorDeliveryRoutesDependencies = {
  readonly scheduleDelivery: {
    execute(input: {
      readonly accessKey: string
      readonly context: CompanyContext
      readonly values: {
        readonly notes: string
        readonly protocol: string
        readonly scheduledAt: string | null
        readonly status: (typeof CLIENT_SCHEDULE_STATUSES)[number]
      }
    }): Promise<TripStopSchedule>
  }
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
    defineRoute<{
      readonly accessKey: string
      readonly values: {
        readonly notes: string
        readonly protocol: string
        readonly scheduledAt: string | null
        readonly status: (typeof CLIENT_SCHEDULE_STATUSES)[number]
      }
    }>({
      async handle({ context, input }): Promise<Response> {
        const schedule = await dependencies.scheduleDelivery.execute({
          accessKey: input.accessKey,
          context: context.scope,
          values: input.values,
        })

        return new Response(JSON.stringify({ data: serializeSchedule(schedule) }), {
          headers: { 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(scheduleSchema, request)

        return {
          accessKey: parseAccessKey(pathParameters.accessKey ?? ''),
          values: {
            notes: body.notes ?? '',
            protocol: body.protocol ?? '',
            scheduledAt: body.scheduledAt ?? null,
            status: body.status,
          },
        }
      },
      /** A chave de acesso não é UUID: o roteador só entrega segmento livre em `opaque`. */
      pathParameterFormat: 'opaque',
      pathname: DELIVERY_SCHEDULE_PATH,
      policy: TRACK_POLICY,
    }),
  ]
}

/**
 * O agendamento devolve o que o contratante precisa conferir — data, protocolo e situação. O id da
 * parada e o da viagem ficam de fora pelo mesmo motivo de sempre.
 */
function serializeSchedule(schedule: TripStopSchedule): Record<string, unknown> {
  return {
    divergedAt: schedule.divergedAt,
    notes: schedule.notes,
    protocol: schedule.protocol,
    scheduledAt: schedule.scheduledAt,
    status: schedule.status,
  }
}

/** Canonicaliza antes de conferir, como a listagem de notas: a etiqueta chega na caixa que imprimiu. */
function parseAccessKey(value: string): string {
  const accessKey = value.trim().toUpperCase()
  if (!CHAVE_PATTERN.test(accessKey)) throw new ApiError(HTTP_ERROR.invalidRequest)

  return accessKey
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
