/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_VIEW_PREFERENCES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { ViewPreferencesRecord } from '../application/view-preferences.port.js'
import { parseSaveViewPreferencesRequest, parseViewKeyQuery } from './view-preferences.schema.js'

const VIEW_PREFERENCES_POLICY = { permission: 'view-preferences.manage', scope: 'company' } as const

type Dependencies = {
  readonly getPreferences: {
    execute(input: {
      readonly context: CompanyContext
      readonly viewKey: string
    }): Promise<ViewPreferencesRecord | null>
  }
  readonly savePreferences: {
    execute(input: {
      readonly context: CompanyContext
      readonly preferences: Record<string, unknown>
      readonly viewKey: string
    }): Promise<ViewPreferencesRecord>
  }
}

type SaveRouteInput = {
  readonly preferences: Record<string, unknown>
  readonly viewKey: string
}

export function createViewPreferencesRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly viewKey: string }>({
      async handle({ context, input }): Promise<Response> {
        return preferencesResponse(
          await dependencies.getPreferences.execute({
            context: context.scope,
            viewKey: input.viewKey,
          }),
        )
      },
      method: 'GET',
      parse: ({ request }) => ({ viewKey: parseViewKeyQuery(request) }),
      pathname: API_VIEW_PREFERENCES_PATH,
      policy: VIEW_PREFERENCES_POLICY,
    }),
    defineRoute<SaveRouteInput>({
      async handle({ context, input }): Promise<Response> {
        return preferencesResponse(
          await dependencies.savePreferences.execute({
            context: context.scope,
            preferences: input.preferences,
            viewKey: input.viewKey,
          }),
        )
      },
      method: 'PUT',
      parse: ({ request }) => parseSaveViewPreferencesRequest(request),
      pathname: API_VIEW_PREFERENCES_PATH,
      policy: VIEW_PREFERENCES_POLICY,
    }),
  ]
}

function preferencesResponse(record: ViewPreferencesRecord | null): Response {
  return new Response(JSON.stringify({ data: record }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}
