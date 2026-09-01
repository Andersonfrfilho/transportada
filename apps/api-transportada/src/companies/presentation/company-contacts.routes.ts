/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os contatos e as redes da empresa (spec 068). É `settings.manage` porque decide o que sai no
 * rodapé do e-mail do sistema e no site institucional — cadastro, não operação.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_SETTINGS_CONTACTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CompanyContactSettings } from '../application/company-contacts.port.js'
import type { CompanyContactsUseCase } from '../application/company-contacts.use-case.js'
import { parseCompanyContactsBody } from './company-contacts.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = { readonly companyContacts: CompanyContactsUseCase }

export function createCompanyContactsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.companyContacts.get({
          companyId: context.scope.companyId,
        })
        return jsonResponse(settings)
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_CONTACTS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<CompanyContactSettings>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.companyContacts.replace({
          companyId: context.scope.companyId,
          settings: input,
        })
        return jsonResponse(settings)
      },
      method: 'PUT',
      parse: ({ request }) => parseCompanyContactsBody(request),
      pathname: API_COMPANY_SETTINGS_CONTACTS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(settings: CompanyContactSettings): Response {
  return new Response(JSON.stringify({ data: settings }), {
    headers: NO_STORE_HEADERS,
    status: 200,
  })
}
