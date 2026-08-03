/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_SETTINGS_LOGO_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CompanyLogoUseCase } from '../application/company-logo.use-case.js'
import type { CompanyLogoMetadata } from '../application/company-logo.port.js'
import { parseCompanyLogoUpload } from './company-logo.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

type Dependencies = {
  readonly companyLogo: CompanyLogoUseCase
}

export function createCompanyLogoRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    createReadRoute(dependencies),
    createReplaceRoute(dependencies),
    createRemoveRoute(dependencies),
  ]
}

function createReadRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<undefined>({
    async handle({ context }): Promise<Response> {
      const logo = await dependencies.companyLogo.find({ context: context.scope })
      return new Response(logo.bytes, {
        headers: {
          'cache-control': 'no-store',
          'content-type': logo.mimeType,
          etag: `"${logo.sha256}"`,
        },
        status: 200,
      })
    },
    method: 'GET',
    parse: () => undefined,
    pathname: API_COMPANY_SETTINGS_LOGO_PATH,
    policy: SETTINGS_MANAGE_POLICY,
  })
}

function createReplaceRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<Uint8Array>({
    async handle({ context, input }): Promise<Response> {
      const logo = await dependencies.companyLogo.replace({ bytes: input, context: context.scope })
      return jsonResponse({ body: { data: serialize(logo) }, status: 200 })
    },
    method: 'PUT',
    parse: ({ request }) => parseCompanyLogoUpload(request),
    pathname: API_COMPANY_SETTINGS_LOGO_PATH,
    policy: SETTINGS_MANAGE_POLICY,
  })
}

function createRemoveRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<undefined>({
    async handle({ context }): Promise<Response> {
      await dependencies.companyLogo.remove({ context: context.scope })
      return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
    },
    method: 'DELETE',
    parse: () => undefined,
    pathname: API_COMPANY_SETTINGS_LOGO_PATH,
    policy: SETTINGS_MANAGE_POLICY,
  })
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serialize(logo: CompanyLogoMetadata): object {
  return {
    byteSize: logo.byteSize,
    mimeType: logo.mimeType,
    sha256: logo.sha256,
    updatedAt: logo.updatedAt.toISOString(),
  }
}
