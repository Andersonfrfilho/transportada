/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ActivateInvitationUseCase } from '../application/activate-invitation.use-case.js'
import { defineAnonymousRoute } from '../../http/router.service.js'
import { API_USER_ACTIVATION_PATH, HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  parseActivateInvitationRequest,
  type ActivateInvitationRequest,
} from './user-activation.schema.js'

type Dependencies = {
  readonly activateInvitation: ActivateInvitationUseCase
}

export function createUserActivationRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineAnonymousRoute>[] {
  return [
    defineAnonymousRoute<ActivateInvitationRequest>({
      async handle({ input }): Promise<Response> {
        await dependencies.activateInvitation.execute(input)
        return new Response(null, { status: 204 })
      },
      method: 'POST',
      async parse({ request }): Promise<ActivateInvitationRequest> {
        const body = await parseJsonBody(request)
        return parseActivateInvitationRequest(body)
      },
      pathname: API_USER_ACTIVATION_PATH,
    }),
  ]
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
