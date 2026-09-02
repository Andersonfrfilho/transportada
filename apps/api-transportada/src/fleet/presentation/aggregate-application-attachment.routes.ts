/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  API_PUBLIC_AGGREGATE_APPLICATION_ATTACHMENTS_PATH,
  HTTP_ERROR,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { verifyTurnstileToken as verifyTurnstileTokenWithCloudflare } from '../../shared/turnstile.service.js'
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import type { AggregateApplicationAttachmentUseCase } from '../application/aggregate-application-attachment.use-case.js'
import {
  parseUploadAggregateApplicationAttachmentRequest,
  type UploadAggregateApplicationAttachmentRequest,
} from './aggregate-application-attachment.schema.js'

const CREATED_STATUS = 201
const ONE_MINUTE_MS = 60_000

/**
 * Mais duro que o do formulário (5 a cada 10 minutos), e a diferença que importa é a **vazão**: aqui
 * são 12 por hora contra 30 lá. Cada envio custa espaço no bucket e uma linha; o formulário custa só
 * a linha.
 *
 * A janela larga é de propósito: quem se candidata anexa até três documentos numa sentada e pode
 * refazer um. Um teto de três quebraria o fluxo normal na primeira correção.
 */
const UPLOAD_RATE_LIMIT = { maxRequests: 6, windowMs: 30 * ONE_MINUTE_MS } as const

type Dependencies = {
  readonly attachments: AggregateApplicationAttachmentUseCase
  /** Ausente (dev local), a rota aceita sem checar — ver `TURNSTILE_SECRET_KEY` no schema de ambiente. */
  readonly turnstileSecretKey?: string
  readonly verifyTurnstileToken?: typeof verifyTurnstileTokenWithCloudflare
}

export function createAggregateApplicationAttachmentPublicRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  const verifyTurnstileToken =
    dependencies.verifyTurnstileToken ?? verifyTurnstileTokenWithCloudflare

  return [
    defineAnonymousRoute<UploadAggregateApplicationAttachmentRequest>({
      /**
       * A resposta devolve **só** o identificador do rascunho e o tipo. Nada do que foi lido do
       * documento volta para quem enviou: a rota é anônima, e ecoar o conteúdo a transformaria numa
       * sonda — bastaria subir o documento de outra pessoa para ler o que ele diz.
       */
      async handle({ correlationId, input }): Promise<Response> {
        if (dependencies.turnstileSecretKey !== undefined) {
          const isHuman = await verifyTurnstileToken({
            secretKey: dependencies.turnstileSecretKey,
            token: input.turnstileToken,
          })
          if (!isHuman) throw new ApiError(HTTP_ERROR.forbidden)
        }

        const draft = await dependencies.attachments.uploadDraft({
          bytes: input.bytes,
          companyId: input.companyId,
          correlationId,
          type: input.type,
        })

        return new Response(JSON.stringify({ data: draft }), {
          headers: { 'content-type': JSON_CONTENT_TYPE },
          status: CREATED_STATUS,
        })
      },
      method: 'POST',
      parse: ({ request }) => parseUploadAggregateApplicationAttachmentRequest(request),
      pathname: API_PUBLIC_AGGREGATE_APPLICATION_ATTACHMENTS_PATH,
      rateLimit: UPLOAD_RATE_LIMIT,
    }),
  ]
}
