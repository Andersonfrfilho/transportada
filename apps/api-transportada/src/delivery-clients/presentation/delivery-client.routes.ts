/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Ler é `fleet.read` e escrever é `fleet.manage`: o cadastro do cliente é o que o formulário da
 * viagem e o roteirizador consultam, e exigir permissão de escrita para listar deixaria a tela de
 * quem monta viagem sem a janela do cliente.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_DELIVERY_CLIENTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { normalizeTaxId, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import type {
  DeliveryClient,
  DeliveryClientDetail,
  DeliveryClientListFilters,
  DeliveryClientPage,
  DeliveryClientWriteInput,
} from '../application/delivery-client.port.js'
import { DeliveryClientNotFoundError } from '../domain/delivery-client.error.js'
import type {
  DeliveryDateException,
  DeliveryWeeklyWindow,
} from '../domain/delivery-window.policy.js'
import {
  parseCreateDeliveryClient,
  parseDeliveryClientList,
  parseDeliveryExceptions,
  parseDeliveryWindows,
  parseUpdateDeliveryClient,
} from './delivery-client.schema.js'

const CLIENT_PATH = `${API_DELIVERY_CLIENTS_PATH}/:id`
const CLIENT_WINDOWS_PATH = `${CLIENT_PATH}/windows`
const CLIENT_EXCEPTIONS_PATH = `${CLIENT_PATH}/exceptions`
const CLIENT_BY_TAX_ID_PATH = `${API_DELIVERY_CLIENTS_PATH}/by-tax-id/:taxId`

const CLIENT_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const CLIENT_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const

export type DeliveryClientRoutesDependencies = {
  readonly createClient: {
    execute(input: {
      readonly context: CompanyContext
      readonly taxId: string
      readonly values: DeliveryClientWriteInput
    }): Promise<DeliveryClient>
  }
  readonly getByTaxId: {
    execute(input: {
      readonly context: CompanyContext
      readonly taxId: string
    }): Promise<DeliveryClientDetail>
  }
  readonly getClient: {
    execute(input: {
      readonly context: CompanyContext
      readonly id: string
    }): Promise<DeliveryClientDetail>
  }
  readonly listClients: {
    execute(input: {
      readonly context: CompanyContext
      readonly filters: DeliveryClientListFilters
    }): Promise<DeliveryClientPage>
  }
  readonly replaceExceptions: {
    execute(input: {
      readonly context: CompanyContext
      readonly exceptions: readonly DeliveryDateException[]
      readonly id: string
    }): Promise<readonly DeliveryDateException[]>
  }
  readonly replaceWindows: {
    execute(input: {
      readonly context: CompanyContext
      readonly id: string
      readonly windows: readonly DeliveryWeeklyWindow[]
    }): Promise<readonly DeliveryWeeklyWindow[]>
  }
  readonly updateClient: {
    execute(input: {
      readonly context: CompanyContext
      readonly id: string
      readonly values: DeliveryClientWriteInput
    }): Promise<DeliveryClient>
  }
}

export function createDeliveryClientRoutes(
  dependencies: DeliveryClientRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly filters: DeliveryClientListFilters }>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listClients.execute({
          context: context.scope,
          filters: input.filters,
        })

        return jsonResponse({
          body: { data: page.items.map(serializeClient), page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseDeliveryClientList(new URL(request.url)),
      pathname: API_DELIVERY_CLIENTS_PATH,
      policy: CLIENT_READ_POLICY,
    }),
    /**
     * A rota por documento vem **antes** da rota por id no arquivo por clareza; o roteador casa por
     * caminho literal, então `by-tax-id` nunca é confundido com um identificador.
     */
    defineRoute<{ readonly taxId: string }>({
      async handle({ context, input }): Promise<Response> {
        const client = await dependencies.getByTaxId.execute({
          context: context.scope,
          taxId: input.taxId,
        })

        return jsonResponse({ body: { data: serializeDetail(client) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ taxId: parseTaxIdPath(pathParameters.taxId ?? '') }),
      /**
       * O documento não é UUID, e o roteador só entrega segmento livre em `opaque`. A canonicalização
       * e a recusa do que não é documento ficam no `parse` — e a barra da máscara não passa nem
       * codificada, que é regra do roteador e é o que se quer: o cliente canonicaliza antes.
       */
      pathParameterFormat: 'opaque',
      pathname: CLIENT_BY_TAX_ID_PATH,
      policy: CLIENT_READ_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const client = await dependencies.getClient.execute({ context: context.scope, id: input.id })
        return jsonResponse({ body: { data: serializeDetail(client) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: CLIENT_PATH,
      policy: CLIENT_READ_POLICY,
    }),
    defineRoute<{ readonly taxId: string; readonly values: DeliveryClientWriteInput }>({
      async handle({ context, input }): Promise<Response> {
        const client = await dependencies.createClient.execute({
          context: context.scope,
          taxId: input.taxId,
          values: input.values,
        })

        return jsonResponse({ body: { data: serializeClient(client) }, status: 201 })
      },
      method: 'POST',
      parse: ({ request }) => parseCreateDeliveryClient(request),
      pathname: API_DELIVERY_CLIENTS_PATH,
      policy: CLIENT_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string; readonly values: DeliveryClientWriteInput }>({
      async handle({ context, input }): Promise<Response> {
        const client = await dependencies.updateClient.execute({
          context: context.scope,
          id: input.id,
          values: input.values,
        })

        return jsonResponse({ body: { data: serializeClient(client) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        return {
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          values: await parseUpdateDeliveryClient(request),
        }
      },
      pathname: CLIENT_PATH,
      policy: CLIENT_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string; readonly windows: readonly DeliveryWeeklyWindow[] }>({
      async handle({ context, input }): Promise<Response> {
        const windows = await dependencies.replaceWindows.execute({
          context: context.scope,
          id: input.id,
          windows: input.windows,
        })

        return jsonResponse({ body: { data: windows }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        return {
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
          windows: await parseDeliveryWindows(request),
        }
      },
      pathname: CLIENT_WINDOWS_PATH,
      policy: CLIENT_MANAGE_POLICY,
    }),
    defineRoute<{ readonly exceptions: readonly DeliveryDateException[]; readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const exceptions = await dependencies.replaceExceptions.execute({
          context: context.scope,
          exceptions: input.exceptions,
          id: input.id,
        })

        return jsonResponse({ body: { data: exceptions }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        return {
          exceptions: await parseDeliveryExceptions(request),
          id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: CLIENT_EXCEPTIONS_PATH,
      policy: CLIENT_MANAGE_POLICY,
    }),
  ]
}

/** Documento fora de forma é **ausência**, não `400`: quem digitou errado procurou o que não existe. */
function parseTaxIdPath(raw: string): string {
  const taxId = normalizeTaxId(decodeURIComponent(raw))
  if (!TAX_ID_PATTERN.test(taxId)) throw new DeliveryClientNotFoundError()
  return taxId
}

function serializeClient(client: DeliveryClient) {
  return {
    defaultServiceTimeMinutes: client.defaultServiceTimeMinutes,
    deliveryFeeAmount: client.deliveryFeeAmount,
    displayName: client.displayName,
    id: client.id,
    notes: client.notes,
    requiresScheduling: client.requiresScheduling,
    status: client.status,
    taxId: client.taxId,
  }
}

function serializeDetail(client: DeliveryClientDetail) {
  return { ...serializeClient(client), exceptions: client.exceptions, windows: client.windows }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
