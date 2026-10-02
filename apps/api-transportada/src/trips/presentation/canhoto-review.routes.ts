/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF27 (T6.8): conferir o canhoto. Escrever é `trip.manage` — o veredito muda o que a
 * operação considera comprovado, e quem só acompanha a viagem lê o resultado pela rota de leitura
 * do comprovante. `companyId`, autor e IP vêm sempre do contexto, nunca do corpo.
 *
 * O Zod aqui confere **forma**; a regra (motivo, nota, precedência) mora na política de domínio,
 * porque o mesmo veredito também chega pela leitura automática, que não passa por HTTP.
 */
import { z } from 'zod'

import {
  TRIP_DELIVERY_PROOF_CANHOTO_READ_SOURCES,
  TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_REASONS,
} from '../../database/trip.schema.js'
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  CanhotoReviewChannel,
  CanhotoReviewCommand,
  CanhotoReviewPort,
} from '../application/canhoto-review.port.js'

const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const
const CANHOTO_AUTO_REVIEW_POLICY = {
  permission: 'trip.canhoto-auto-review',
  scope: 'company',
} as const

/**
 * RNF03 na fronteira: o espelho de `canhoto_read_number varchar(9)` / `canhoto_read_series
 * varchar(3)`. Sem o teto, uma chave de acesso de 44 posições passaria pelo Zod e só morreria no
 * `INSERT` — 500 em vez de 400, e o CPF do produtor rural que a chave embute já teria subido.
 */
const CANHOTO_READ_NUMBER_MAX_LENGTH = 9
const CANHOTO_READ_SERIES_MAX_LENGTH = 3

export const TRIP_DOCUMENT_PROOF_REVIEW_PATH = `${API_TRIPS_PATH}/:id/documents/:documentId/proof/review`
export const TRIP_DOCUMENT_PROOF_AUTOMATIC_REVIEW_PATH = `${TRIP_DOCUMENT_PROOF_REVIEW_PATH}/automatic`

/**
 * `automatic` entra pela rota porque RF25 põe a leitura no navegador: não existe outro chamador. O
 * que ele manda é só o que **leu** — o veredito é derivado no servidor
 * (`canhoto-review-decision.policy.ts`), contra o documento da rota e o número daquela nota. Por
 * isso RF26 ("OCR nunca aprova sozinho") é invariante, e não convenção do cliente: um painel
 * adulterado consegue no máximo mentir sobre o que leu, e uma leitura que não casa vira `pending`.
 *
 * ⚠️ O `.strict()` é parte da garantia: `review` no corpo é 400, não campo ignorado.
 */
const REVIEW_BODY_SCHEMA = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('approve') }).strict(),
    z
      .object({
        action: z.literal('reject'),
        note: z.string().optional(),
        reason: z.enum(TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_REASONS),
      })
      .strict(),
    z
      .object({
        action: z.literal('automatic'),
        readDocumentId: z.string().uuid().nullable(),
        readNumber: z.string().min(1).max(CANHOTO_READ_NUMBER_MAX_LENGTH).nullable(),
        readSeries: z.string().min(1).max(CANHOTO_READ_SERIES_MAX_LENGTH).nullable(),
        readSource: z.enum(TRIP_DELIVERY_PROOF_CANHOTO_READ_SOURCES).nullable(),
      })
      .strict(),
  ])
  .readonly()

/**
 * Spec 222 / ADR-0091: o corpo do robô é só o que ele **leu**. Sem `action` (a rota já diz qual é) e
 * sem veredito — a máquina nunca recusa, e o servidor deriva o veredito. Os quatro campos são
 * obrigatórios e `nullable()`: `null` é "li e não achei", ausente é corpo malformado; com
 * `exactOptionalPropertyTypes` um `optional()` chegaria `undefined` e passaria batido pela
 * comparação contra `null` da política.
 */
const AUTOMATIC_REVIEW_BODY_SCHEMA = z
  .object({
    readDocumentId: z.string().uuid().nullable(),
    readNumber: z.string().min(1).max(CANHOTO_READ_NUMBER_MAX_LENGTH).nullable(),
    readSeries: z.string().min(1).max(CANHOTO_READ_SERIES_MAX_LENGTH).nullable(),
    readSource: z.enum(TRIP_DELIVERY_PROOF_CANHOTO_READ_SOURCES).nullable(),
  })
  .strict()
  .readonly()

export type CanhotoReviewRoutesDependencies = {
  readonly canhotoReview: CanhotoReviewPort
  readonly resolveClientIp: ClientIpResolver
}

type ReviewRouteInput = {
  readonly channel: CanhotoReviewChannel
  readonly command: CanhotoReviewCommand
  readonly correlationId: string
  readonly documentId: string
  readonly ipAddress: string
  readonly tripId: string
}

/** `exactOptionalPropertyTypes`: a nota ausente some do comando, em vez de virar `undefined`. */
function toCommand(body: z.infer<typeof REVIEW_BODY_SCHEMA>): CanhotoReviewCommand {
  if (body.action === 'approve') return { action: 'approve' }
  if (body.action === 'automatic') {
    return {
      action: 'automatic',
      readDocumentId: body.readDocumentId,
      readNumber: body.readNumber,
      readSeries: body.readSeries,
      readSource: body.readSource,
    }
  }
  return {
    action: 'reject',
    ...(body.note === undefined ? {} : { note: body.note }),
    reason: body.reason,
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

export function createCanhotoReviewRoutes(
  dependencies: CanhotoReviewRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { canhotoReview, resolveClientIp } = dependencies

  async function handleReview({
    context,
    input,
  }: {
    readonly context: { readonly scope: { readonly companyId: string; readonly userId: string } }
    readonly input: ReviewRouteInput
  }): Promise<Response> {
    const view = await canhotoReview.review({
      actorUserId: context.scope.userId,
      channel: input.channel,
      command: input.command,
      companyId: context.scope.companyId,
      correlationId: input.correlationId,
      documentId: input.documentId,
      ipAddress: input.ipAddress,
      tripId: input.tripId,
    })
    return jsonResponse({ body: { data: view }, status: 200 })
  }

  function parseReview(route: {
    readonly channel: CanhotoReviewChannel
    readonly toRouteCommand: (request: Request) => Promise<CanhotoReviewCommand>
  }): (parameters: {
    readonly correlationId: string
    readonly pathParameters: Readonly<Record<string, string | undefined>>
    readonly request: Request
  }) => Promise<ReviewRouteInput> {
    return async ({ correlationId, pathParameters, request }) => ({
      channel: route.channel,
      command: await route.toRouteCommand(request),
      correlationId,
      documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
      ipAddress: resolveClientIp(request),
      tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
    })
  }

  return [
    defineRoute<ReviewRouteInput>({
      handle: handleReview,
      method: 'PATCH',
      parse: parseReview({
        channel: 'person',
        toRouteCommand: async (request) =>
          toCommand(await parseOptionalBody(REVIEW_BODY_SCHEMA, request)),
      }),
      pathname: TRIP_DOCUMENT_PROOF_REVIEW_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<ReviewRouteInput>({
      handle: handleReview,
      method: 'PATCH',
      parse: parseReview({
        channel: 'service',
        toRouteCommand: async (request) => ({
          action: 'automatic',
          ...(await parseOptionalBody(AUTOMATIC_REVIEW_BODY_SCHEMA, request)),
        }),
      }),
      pathname: TRIP_DOCUMENT_PROOF_AUTOMATIC_REVIEW_PATH,
      policy: CANHOTO_AUTO_REVIEW_POLICY,
    }),
  ]
}
