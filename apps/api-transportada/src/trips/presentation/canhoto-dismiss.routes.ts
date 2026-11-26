/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d: "Descartar" o alerta de canhoto de outra nota, sob `trip.manage`. Sem corpo útil:
 * o corpo, se vier, é `{}` estrito. Empresa, ator e IP vêm do contexto.
 */
import { z } from 'zod'

import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  CanhotoDismissPort,
  DismissCanhotoMismatchCommand,
} from '../application/canhoto-dismiss.port.js'

const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const

export const TRIP_DOCUMENT_PROOF_MISMATCH_DISMISS_PATH = `${API_TRIPS_PATH}/:id/documents/:documentId/proof/mismatch/dismiss`

const DISMISS_BODY_SCHEMA = z.object({}).strict().readonly()

export type CanhotoDismissRoutesDependencies = {
  readonly canhotoDismiss: CanhotoDismissPort
  readonly resolveClientIp: ClientIpResolver
}

type DismissRouteInput = Omit<DismissCanhotoMismatchCommand, 'actorUserId' | 'companyId'>

export function createCanhotoDismissRoutes(
  dependencies: CanhotoDismissRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { canhotoDismiss, resolveClientIp } = dependencies

  return [
    defineRoute<DismissRouteInput>({
      handle: async ({ context, input }) => {
        const result = await canhotoDismiss.dismiss({
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
        await parseOptionalBody(DISMISS_BODY_SCHEMA, request)
        return {
          correlationId,
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          ipAddress: resolveClientIp(request),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_DOCUMENT_PROOF_MISMATCH_DISMISS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
  ]
}
