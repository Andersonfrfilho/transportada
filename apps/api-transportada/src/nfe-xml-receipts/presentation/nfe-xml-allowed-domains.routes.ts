/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 313: liberar, listar e desligar domínios de e-mail que podem enviar XML, sempre de um contratante.
 * Exige `settings.manage`; a empresa vem só do contexto autenticado.
 */
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_NFE_XML_ALLOWED_DOMAINS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  createListNfeXmlAllowedDomainsUseCase,
  createReleaseNfeXmlAllowedDomainUseCase,
  type NfeXmlAllowedDomainPort,
  type NfeXmlAllowedDomainView,
} from '../application/manage-nfe-xml-allowed-domains.use-case.js'
import {
  parseNfeXmlAllowedDomainStatusBody,
  parseReleaseNfeXmlAllowedDomainBody,
  type ReleaseNfeXmlAllowedDomainBody,
} from './nfe-xml-allowed-domains.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const ITEM_PATH = `${API_NFE_XML_ALLOWED_DOMAINS_PATH}/:id`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly list: {
    execute(input: { readonly companyId: string }): Promise<readonly NfeXmlAllowedDomainView[]>
  }
  readonly release: {
    execute(input: {
      readonly companyId: string
      readonly contractorId: string
      readonly domain: string
    }): Promise<NfeXmlAllowedDomainView>
  }
  readonly setStatus: {
    execute(input: {
      readonly companyId: string
      readonly id: string
      readonly status: 'active' | 'inactive'
    }): Promise<NfeXmlAllowedDomainView | undefined>
  }
}

export function buildNfeXmlAllowedDomainDependencies(
  repository: NfeXmlAllowedDomainPort,
): Dependencies {
  return {
    list: createListNfeXmlAllowedDomainsUseCase({ repository }),
    release: createReleaseNfeXmlAllowedDomainUseCase({ repository }),
    setStatus: { execute: (input) => repository.setStatus(input) },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}

export function createNfeXmlAllowedDomainRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const data = await dependencies.list.execute({ companyId: context.scope.companyId })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_NFE_XML_ALLOWED_DOMAINS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ReleaseNfeXmlAllowedDomainBody>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.release.execute({
          companyId: context.scope.companyId,
          contractorId: input.contractorId,
          domain: input.domain,
        })
        return jsonResponse({ data }, 201)
      },
      method: 'POST',
      parse: ({ request }) => parseReleaseNfeXmlAllowedDomainBody(request),
      pathname: API_NFE_XML_ALLOWED_DOMAINS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string; readonly status: 'active' | 'inactive' }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.setStatus.execute({
          companyId: context.scope.companyId,
          id: input.id,
          status: input.status,
        })
        if (data === undefined) {
          throw new ApiError({
            code: 'NFE_XML_ALLOWED_DOMAIN_NOT_FOUND',
            message: 'The domain is not released in this company.',
            status: 404,
          })
        }
        return jsonResponse({ data })
      },
      method: 'PATCH',
      parse: async ({ pathParameters, request }) => ({
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ...(await parseNfeXmlAllowedDomainStatusBody(request)),
      }),
      pathname: ITEM_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
