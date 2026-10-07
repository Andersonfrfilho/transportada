/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M4): `GET /contractor-receiving-profiles` lista o resumo dos
 * perfis da empresa do contexto (`fleet.read`, como ler um perfil). Rota própria de propósito: o
 * agregado `Contractor` e o `PATCH /contractors` não mudam — o painel confere a chave exata deles.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  optionalFilter,
  parseBooleanFilter,
  parseLimit,
  parseUuidFilter,
  readListQuery,
} from '../../http/request-parsing.service.js'
import { API_CONTRACTOR_RECEIVING_PROFILES_PATH } from '../../shared/api.constant.js'
import type {
  ContractorReceivingProfilePage,
  ContractorReceivingProfilePaging,
  ListContractorReceivingProfilesParams,
} from '../application/contractor-receiving-profile.types.js'
import { jsonResponse } from './cargo-arrival-http.support.js'

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const QUERY_KEYS = new Set<string>(['cursor', 'enabled', 'limit'])

export type ContractorReceivingProfileListRoutesDependencies = {
  readonly listProfiles: {
    execute(params: ListContractorReceivingProfilesParams): Promise<ContractorReceivingProfilePage>
  }
}

type ListInput = { readonly enabled?: boolean; readonly paging: ContractorReceivingProfilePaging }

export function createContractorReceivingProfileListRoutes(
  dependencies: ContractorReceivingProfileListRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ListInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listProfiles.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: page.items, nextCursor: page.nextCursor },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseListQuery(new URL(request.url)),
      pathname: API_CONTRACTOR_RECEIVING_PROFILES_PATH,
      policy: READ_POLICY,
    }),
  ]
}

function parseListQuery(url: URL): ListInput {
  const query = readListQuery(url, QUERY_KEYS)
  return {
    ...optionalFilter('enabled', parseBooleanFilter(query.get('enabled'))),
    paging: {
      cursor: parseUuidFilter(query.get('cursor')) ?? null,
      limit: parseLimit(query.get('limit')),
    },
  }
}
