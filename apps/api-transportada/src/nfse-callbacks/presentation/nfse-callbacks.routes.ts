/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import { API_PUBLIC_NFSE_CALLBACKS_PATH } from '../../shared/api.constant.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { NotifyNfseCallbackUseCase } from '../application/nfse-callback.port.js'

const CALLBACK_FAILURE_MESSAGE = 'nfse callback anticipation failed'
const NO_CONTENT_STATUS = 204

type NfseCallbackInput = {
  readonly token: string
}

type CreateNfseCallbackRoutesParams = {
  readonly callbackBaseUrl: string | undefined
  readonly logger: ApiLogger
  readonly notifyNfseCallback: NotifyNfseCallbackUseCase
}

/**
 * Instalação que nunca publicou endereço de callback não ganha superfície pública: sem
 * `NFSE_CALLBACK_BASE_URL` a rota não é registrada, no mesmo espírito do ADR-0022.
 */
export function createNfseCallbackRoutes({
  callbackBaseUrl,
  logger,
  notifyNfseCallback,
}: CreateNfseCallbackRoutesParams): readonly RegisteredAnonymousRoute[] {
  if (callbackBaseUrl === undefined) return []

  return [
    defineAnonymousRoute<NfseCallbackInput>({
      /**
       * 204 invariável: token válido, token inventado, empresa inexistente ou banco fora do ar
       * respondem igual. A resposta não confirma existência nem sucesso, e falha de infraestrutura
       * vira aviso de servidor em vez de 500 — o postback é gatilho, não fonte da verdade.
       */
      async handle({ correlationId, input }): Promise<Response> {
        try {
          await notifyNfseCallback.execute({ token: input.token })
        } catch (error) {
          logger.warn(CALLBACK_FAILURE_MESSAGE, {
            correlationId,
            reason: error instanceof Error ? error.name : 'unknown',
          })
        }
        return new Response(null, { status: NO_CONTENT_STATUS })
      },
      method: 'POST',
      // O corpo do postback é entrada hostil sem uso: não é lido, não é validado, não é logado.
      parse({ pathParameters }): NfseCallbackInput {
        return { token: pathParameters.token ?? '' }
      },
      pathname: API_PUBLIC_NFSE_CALLBACKS_PATH,
      // O token é opaco por construção, não UUID canônico.
      pathParameterFormat: 'opaque',
    }),
  ]
}
