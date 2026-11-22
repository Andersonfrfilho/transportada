/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D9/RF10: mover o comprovante do canhoto para a NF certa, sob `trip.manage`. O corpo é
 * `.strict()` e só leva o destino e o motivo da lista fechada: `companyId`, ator e IP vêm do
 * contexto, e a nota de origem vem da rota — nunca do corpo.
 */
import { z } from 'zod'

import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CanhotoMovePort, MoveCanhotoProofCommand } from '../application/canhoto-move.port.js'
import { CANHOTO_MOVE_REASONS } from '../domain/canhoto-move.policy.js'

const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const

export const TRIP_DOCUMENT_PROOF_MOVE_PATH = `${API_TRIPS_PATH}/:id/documents/:documentId/proof/move`

const MOVE_BODY_SCHEMA = z
  .object({
    reason: z.enum(CANHOTO_MOVE_REASONS),
    targetDocumentId: z.string().uuid(),
  })
  .strict()
  .readonly()

export type CanhotoMoveRoutesDependencies = {
  readonly canhotoMove: CanhotoMovePort
  readonly resolveClientIp: ClientIpResolver
}

type MoveRouteInput = Omit<MoveCanhotoProofCommand, 'actorUserId' | 'companyId'>

export function createCanhotoMoveRoutes(
  dependencies: CanhotoMoveRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { canhotoMove, resolveClientIp } = dependencies

  return [
    defineRoute<MoveRouteInput>({
      handle: async ({ context, input }) => {
        const result = await canhotoMove.move({
          ...input,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
        })
        return new Response(JSON.stringify({ data: result }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'POST',
      parse: async ({ correlationId, pathParameters, request }) => {
        const body = await parseOptionalBody(MOVE_BODY_SCHEMA, request)
        return {
          correlationId,
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          ipAddress: resolveClientIp(request),
          reason: body.reason,
          targetDocumentId: body.targetDocumentId,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_DOCUMENT_PROOF_MOVE_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
  ]
}
