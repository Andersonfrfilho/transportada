/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316: cadastro do vendedor, ligação às contratantes e carteira. Exige `settings.manage`; a empresa e o ator
 * vêm só do contexto autenticado. O contato do vendedor sai em claro só aqui, para quem administra o cadastro.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_SALESPEOPLE_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  PortfolioClient,
  Salesperson,
  SalespersonActor,
} from '../application/salesperson.port.js'
import type { SalespersonInput } from '../application/salesperson.use-case.js'
import {
  parsePortfolioBody,
  parseSalespersonBody,
  type SalespersonBody,
} from './salesperson.schema.js'

const MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const ITEM_PATH = `${API_SALESPEOPLE_PATH}/:id`
const CONTRACTOR_PATH = `${ITEM_PATH}/contractors/:contractorId`
const PORTFOLIO_PATH = `${CONTRACTOR_PATH}/clients`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type LinkInput = {
  readonly contractorId: string
  readonly correlationId: string
  readonly id: string
  readonly ipAddress: string
}

type Dependencies = {
  readonly create: {
    execute(params: SalespersonActor & { readonly input: SalespersonInput }): Promise<Salesperson>
  }
  readonly link: {
    execute(
      params: SalespersonActor & { readonly contractorId: string; readonly id: string },
    ): Promise<Salesperson>
  }
  readonly list: {
    execute(params: {
      readonly companyId: string
      readonly search: string | null
    }): Promise<readonly Salesperson[]>
  }
  readonly readPortfolio: {
    execute(params: {
      readonly companyId: string
      readonly contractorId: string
      readonly id: string
    }): Promise<readonly PortfolioClient[]>
  }
  readonly replacePortfolio: {
    execute(
      params: SalespersonActor & {
        readonly contractorId: string
        readonly id: string
        readonly taxIds: readonly string[]
      },
    ): Promise<readonly PortfolioClient[]>
  }
  readonly resolveClientIp: ClientIpResolver
  readonly unlink: {
    execute(
      params: SalespersonActor & { readonly contractorId: string; readonly id: string },
    ): Promise<Salesperson>
  }
  readonly update: {
    execute(
      params: SalespersonActor & { readonly id: string; readonly input: SalespersonInput },
    ): Promise<Salesperson>
  }
}

export function createSalespersonRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const actor = (
    context: { readonly scope: { readonly companyId: string; readonly userId: string } },
    input: { readonly correlationId: string; readonly ipAddress: string },
  ): SalespersonActor => ({
    companyId: context.scope.companyId,
    correlationId: input.correlationId,
    ipAddress: input.ipAddress,
    userId: context.scope.userId,
  })

  return [
    defineRoute<{ readonly search: string | null }>({
      async handle({ context, input }): Promise<Response> {
        const people = await dependencies.list.execute({
          companyId: context.scope.companyId,
          search: input.search,
        })

        return jsonResponse({ data: people.map(serialize) })
      },
      method: 'GET',
      parse: ({ request }) => ({ search: new URL(request.url).searchParams.get('search') }),
      pathname: API_SALESPEOPLE_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{
      readonly body: SalespersonBody
      readonly correlationId: string
      readonly ipAddress: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const created = await dependencies.create.execute({
          ...actor(context, input),
          input: input.body,
        })

        return jsonResponse({ data: serialize(created) }, 201)
      },
      method: 'POST',
      parse: async ({ correlationId, request }) => ({
        body: await parseSalespersonBody(request),
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
      }),
      pathname: API_SALESPEOPLE_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{
      readonly body: SalespersonBody
      readonly correlationId: string
      readonly id: string
      readonly ipAddress: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const updated = await dependencies.update.execute({
          ...actor(context, input),
          id: input.id,
          input: input.body,
        })

        return jsonResponse({ data: serialize(updated) })
      },
      method: 'PUT',
      parse: async ({ correlationId, pathParameters, request }) => ({
        body: await parseSalespersonBody(request),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ipAddress: dependencies.resolveClientIp(request),
      }),
      pathname: ITEM_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<LinkInput>({
      async handle({ context, input }): Promise<Response> {
        const linked = await dependencies.link.execute({
          ...actor(context, input),
          contractorId: input.contractorId,
          id: input.id,
        })

        return jsonResponse({ data: serialize(linked) })
      },
      method: 'PUT',
      parse: ({ correlationId, pathParameters, request }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.contractorId ?? ''),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ipAddress: dependencies.resolveClientIp(request),
      }),
      pathname: CONTRACTOR_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<LinkInput>({
      async handle({ context, input }): Promise<Response> {
        const unlinked = await dependencies.unlink.execute({
          ...actor(context, input),
          contractorId: input.contractorId,
          id: input.id,
        })

        return jsonResponse({ data: serialize(unlinked) })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters, request }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.contractorId ?? ''),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ipAddress: dependencies.resolveClientIp(request),
      }),
      pathname: CONTRACTOR_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly contractorId: string; readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const clients = await dependencies.readPortfolio.execute({
          companyId: context.scope.companyId,
          contractorId: input.contractorId,
          id: input.id,
        })

        return jsonResponse({ data: clients.map(serializeClient) })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.contractorId ?? ''),
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: PORTFOLIO_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<LinkInput & { readonly taxIds: readonly string[] }>({
      async handle({ context, input }): Promise<Response> {
        const clients = await dependencies.replacePortfolio.execute({
          ...actor(context, input),
          contractorId: input.contractorId,
          id: input.id,
          taxIds: input.taxIds,
        })

        return jsonResponse({ data: clients.map(serializeClient) })
      },
      method: 'PUT',
      parse: async ({ correlationId, pathParameters, request }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.contractorId ?? ''),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ipAddress: dependencies.resolveClientIp(request),
        taxIds: (await parsePortfolioBody(request)).taxIds,
      }),
      pathname: PORTFOLIO_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

/** Lista branca de campos: o objeto do repositório nunca é espalhado na resposta. */
function serialize(person: Salesperson): Record<string, unknown> {
  return {
    contractors: person.contractors.map((link) => ({
      clientCount: link.clientCount,
      contractorId: link.contractorId,
      contractorName: link.contractorName,
    })),
    createdAt: person.createdAt.toISOString(),
    email: person.email,
    id: person.id,
    name: person.name,
    status: person.status,
    updatedAt: person.updatedAt.toISOString(),
    whatsapp: person.whatsappE164,
  }
}

function serializeClient(client: PortfolioClient): Record<string, unknown> {
  return { displayName: client.displayName, taxId: client.taxId }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}
