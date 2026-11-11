/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E7, CA5, T6): a marca "cobra no recebimento" do cliente. Ler é `fleet.read` e limpar é `fleet.manage`,
 * as mesmas do cadastro do cliente (não existe `delivery.manage`). Rota própria, fora do detalhe do cliente: o painel
 * publicado valida o detalhe com chaves exatas, e chave nova ali derrubaria a tela.
 *
 * Cliente de outra empresa responde como inexistente (404), nunca 403.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_DELIVERY_CLIENTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { DeliveryClientReceivingChargeFlag } from '../application/delivery-client-receiving-charge-flag.port.js'
import { DeliveryClientNotFoundError } from '../domain/delivery-client.error.js'

const FLAG_PATH = `${API_DELIVERY_CLIENTS_PATH}/:id/receiving-charge-flag`
const FLAG_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const FLAG_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const

export type DeliveryClientReceivingChargeFlagRoutesDependencies = {
  readonly clearFlag: {
    execute(input: {
      readonly context: CompanyContext
      readonly correlationId: string
      readonly deliveryClientId: string
    }): Promise<DeliveryClientReceivingChargeFlag | null>
  }
  readonly readFlag: {
    execute(input: {
      readonly context: CompanyContext
      readonly deliveryClientId: string
    }): Promise<DeliveryClientReceivingChargeFlag | null>
  }
}

function flagResponse(flag: DeliveryClientReceivingChargeFlag | null): Response {
  if (flag === null) throw new DeliveryClientNotFoundError()
  return new Response(JSON.stringify({ data: flag }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

export function createDeliveryClientReceivingChargeFlagRoutes(
  dependencies: DeliveryClientReceivingChargeFlagRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        return flagResponse(
          await dependencies.readFlag.execute({
            context: context.scope,
            deliveryClientId: input.id,
          }),
        )
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: FLAG_PATH,
      policy: FLAG_READ_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        return flagResponse(
          await dependencies.clearFlag.execute({
            context: context.scope,
            correlationId: input.correlationId,
            deliveryClientId: input.id,
          }),
        )
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: FLAG_PATH,
      policy: FLAG_MANAGE_POLICY,
    }),
  ]
}
