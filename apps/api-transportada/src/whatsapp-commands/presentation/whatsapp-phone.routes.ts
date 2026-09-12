/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../identity/presentation/user-administration.schema.js'
import {
  API_COMPANY_USERS_PATH,
  API_ME_WHATSAPP_PHONE_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { RequestWhatsAppPhoneVerification } from '../application/request-whatsapp-phone-verification.use-case.js'
import type { UnbindWhatsAppPhoneUseCase } from '../application/unbind-whatsapp-phone.use-case.js'
import { WHATSAPP_PHONE_VERIFICATION_REQUEST_LIMIT } from '../domain/whatsapp-phone-verification.constant.js'
import { parseWhatsAppPhoneVerificationRequest } from './whatsapp-phone.schema.js'

const VERIFICATION_PATH = `${API_ME_WHATSAPP_PHONE_PATH}/verification`
const COMPANY_USER_WHATSAPP_PHONE_PATH = `${API_COMPANY_USERS_PATH}/:id/whatsapp-phone`
/** O bot serve do motorista ao administrador: pedir o código é de qualquer membership ativa. */
const MEMBERSHIP_POLICY = { membership: 'active', scope: 'company' } as const
const USERS_MANAGE_POLICY = { permission: 'users.manage', scope: 'company' } as const
const NO_STORE = 'no-store'

type Dependencies = {
  readonly requestVerification: RequestWhatsAppPhoneVerification
  readonly unbind: UnbindWhatsAppPhoneUseCase
}

/**
 * Spec 144 T004. A confirmação **não é rota**: é a mensagem que chega do próprio número. Aqui só se
 * pede o código e se desfaz o vínculo.
 */
export function createWhatsAppPhoneRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly phone: string }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.requestVerification({
          companyId: context.scope.companyId,
          phone: input.phone,
          userId: context.scope.userId,
        })
        /** `no-store`: o código é segredo de uso único e não pode sobrar em cache nenhum. */
        return new Response(
          JSON.stringify({
            data: {
              code: result.code,
              companyNumber: result.companyNumber,
              expiresAt: result.expiresAt.toISOString(),
            },
          }),
          {
            headers: { 'cache-control': NO_STORE, 'content-type': JSON_CONTENT_TYPE },
            status: 201,
          },
        )
      },
      method: 'POST',
      parse: ({ request }) => parseWhatsAppPhoneVerificationRequest(request),
      pathname: VERIFICATION_PATH,
      policy: MEMBERSHIP_POLICY,
      rateLimit: WHATSAPP_PHONE_VERIFICATION_REQUEST_LIMIT,
    }),
    defineRoute<{ readonly correlationId: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.unbind.unbindOwn({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          userId: context.scope.userId,
        })
        return noContent()
      },
      method: 'DELETE',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_ME_WHATSAPP_PHONE_PATH,
      policy: MEMBERSHIP_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly userId: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.unbind.unbindByAdministrator({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          userId: input.userId,
        })
        return noContent()
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        userId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: COMPANY_USER_WHATSAPP_PHONE_PATH,
      pathParameterFormat: 'raw',
      policy: USERS_MANAGE_POLICY,
    }),
  ]
}

function noContent(): Response {
  return new Response(null, { headers: { 'cache-control': NO_STORE }, status: 204 })
}
