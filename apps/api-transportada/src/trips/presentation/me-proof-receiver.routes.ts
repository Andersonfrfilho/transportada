/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 D7 (ADR-0079 §A4): quem recebeu escolhido depois de a foto já ter subido. A fila do
 * aparelho manda este `PATCH` com a `Idempotency-Key` do toque; o servidor aplica a forma tolerante
 * e a configuração da nota e responde 200 `{ changed }`. Arquivo próprio, fora de `me-trip.routes.ts`,
 * porque a rota tem teto e as outras de `/me/trips/current` não têm.
 */
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_ME_CURRENT_TRIP_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { DriverNotRegisteredError } from '../domain/trip.error.js'
import { parseIdempotencyKey } from './me-trip.schema.js'
import { parseProofReceiverBody, type ProofReceiverPatch } from './me-proof-receiver.schema.js'

const PROOF_RECEIVER_PATH = `${API_ME_CURRENT_TRIP_PATH}/documents/:documentId/proof/receiver`
const DRIVER_REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const

/** Um balde por motorista: a fila drena em rajada depois do túnel, mas 60 por minuto já sobra. */
export const PROOF_RECEIVER_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'me-proof-receiver',
  store: 'postgres',
  windowSeconds: 60,
} as const

export type MeProofReceiverDependencies = {
  /** `null` quando a conta autenticada não está ligada a nenhum cadastro de motorista. */
  readonly resolveDriverId: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<string | null>
  readonly updateProofReceiver: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly patch: ProofReceiverPatch
  }) => Promise<{ readonly changed: boolean; readonly id: string }>
}

export function createMeProofReceiverRoutes(
  dependencies: MeProofReceiverDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{
      readonly documentId: string
      readonly idempotencyKey: string
      readonly patch: ProofReceiverPatch
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await dependencies.resolveDriverId(context.scope)
        if (driverId === null) throw new DriverNotRegisteredError()
        const result = await dependencies.updateProofReceiver({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          documentId: input.documentId,
          driverId,
          idempotencyKey: input.idempotencyKey,
          patch: input.patch,
        })

        return new Response(JSON.stringify({ data: { changed: result.changed } }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        return {
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          idempotencyKey: parseIdempotencyKey(request),
          patch: await parseProofReceiverBody(request),
        }
      },
      pathname: PROOF_RECEIVER_PATH,
      policy: DRIVER_REPORT_POLICY,
      rateLimit: PROOF_RECEIVER_RATE_LIMIT,
    }),
  ]
}
