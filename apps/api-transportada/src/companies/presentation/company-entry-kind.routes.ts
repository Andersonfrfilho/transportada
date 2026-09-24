/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 RF7: o cadastro mora na aba de configuração do módulo financeiro, exige
 * `settings.manage`. A leitura das espécies ativas por lado (usada no seletor do lançamento) exige
 * só `trip.manage` (spec 169 RF8: lançar exige a mesma permissão de lançar gasto).
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_ENTRY_KINDS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { invalidRequest, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import {
  COMPANY_ENTRY_KIND_SIDES,
  type CompanyEntryKindSide,
} from '../../database/trip-financial.schema.js'
import type { CompanyEntryKind } from '../application/company-entry-kind.port.js'
import { parseCreateCompanyEntryKindRequest } from './company-entry-kind.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const
const ACTIVE_PATH = `${API_COMPANY_SETTINGS_ENTRY_KINDS_PATH}/active`
const ITEM_PATH = `${API_COMPANY_SETTINGS_ENTRY_KINDS_PATH}/:id`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly create: {
    execute(input: {
      readonly companyId: string
      readonly name: string
      readonly side: CompanyEntryKindSide
    }): Promise<CompanyEntryKind>
  }
  readonly deactivate: {
    execute(input: {
      readonly companyId: string
      readonly entryKindId: string
    }): Promise<CompanyEntryKind | null>
  }
  readonly list: {
    execute(input: { readonly companyId: string }): Promise<readonly CompanyEntryKind[]>
  }
  readonly listActive: {
    execute(input: {
      readonly companyId: string
      readonly side: CompanyEntryKindSide
    }): Promise<readonly CompanyEntryKind[]>
  }
}

function parseSide(value: string | null): CompanyEntryKindSide {
  const side = COMPANY_ENTRY_KIND_SIDES.find((candidate) => candidate === value)
  if (side === undefined) throw invalidRequest([{ field: 'side', message: 'invalid side' }])
  return side
}

export function createCompanyEntryKindRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const kinds = await dependencies.list.execute({ companyId: context.scope.companyId })
        return jsonResponse({ data: kinds.map(serialize) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_ENTRY_KINDS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly side: CompanyEntryKindSide }>({
      async handle({ context, input }): Promise<Response> {
        const kinds = await dependencies.listActive.execute({
          companyId: context.scope.companyId,
          side: input.side,
        })
        return jsonResponse({ data: kinds.map(serialize) })
      },
      method: 'GET',
      parse: ({ request }) => ({ side: parseSide(new URL(request.url).searchParams.get('side')) }),
      pathname: ACTIVE_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<{ readonly name: string; readonly side: CompanyEntryKindSide }>({
      async handle({ context, input }): Promise<Response> {
        const created = await dependencies.create.execute({
          companyId: context.scope.companyId,
          name: input.name,
          side: input.side,
        })
        return jsonResponse({ data: serialize(created) }, 201)
      },
      method: 'POST',
      parse: ({ request }) => parseCreateCompanyEntryKindRequest(request),
      pathname: API_COMPANY_SETTINGS_ENTRY_KINDS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.deactivate.execute({
          companyId: context.scope.companyId,
          entryKindId: input.id,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({ id: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: ITEM_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function serialize(kind: CompanyEntryKind): Record<string, unknown> {
  return {
    active: kind.active,
    displayOrder: kind.displayOrder,
    id: kind.id,
    name: kind.name,
    side: kind.side,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}
