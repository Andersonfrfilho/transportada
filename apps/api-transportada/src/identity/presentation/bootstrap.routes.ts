/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BootstrapFirstAdminUseCase } from '../application/bootstrap-first-admin.use-case.js'
import type { BootstrapFirstAdminInput } from '../application/bootstrap-first-admin.port.js'
import { defineAnonymousRoute } from '../../http/router.service.js'
import {
  API_BOOTSTRAP_FIRST_ADMIN_PATH,
  HTTP_ERROR,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseBootstrapFirstAdminRequest } from './bootstrap.schema.js'

type Dependencies = {
  readonly bootstrapFirstAdmin: BootstrapFirstAdminUseCase
}

export function createBootstrapRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineAnonymousRoute>[] {
  return [
    defineAnonymousRoute<BootstrapFirstAdminInput>({
      async handle({ input }): Promise<Response> {
        const result = await dependencies.bootstrapFirstAdmin.execute(input)
        return new Response(JSON.stringify({ data: result }), {
          headers: { 'content-type': JSON_CONTENT_TYPE },
          status: 201,
        })
      },
      method: 'POST',
      async parse({ correlationId, request }): Promise<BootstrapFirstAdminInput> {
        await dependencies.bootstrapFirstAdmin.assertAvailable({
          token: extractBearerToken(request.headers.get('authorization')),
        })

        const body = await parseJsonBody(request)
        return { administrator: parseBootstrapFirstAdminRequest(body), correlationId }
      },
      pathname: API_BOOTSTRAP_FIRST_ADMIN_PATH,
    }),
  ]
}

function extractBearerToken(header: string | null): string | undefined {
  if (header === null) return undefined
  return /^Bearer (.+)$/.exec(header)?.[1]
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
