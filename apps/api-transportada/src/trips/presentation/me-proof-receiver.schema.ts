/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 D7: o corpo do `PATCH .../proof/receiver`. Campo ausente não mexe; presente passa pela
 * mesma forma tolerante do anexo (D2) — a fila do aparelho nunca recebe 400 por quem recebeu. Só o
 * corpo que não é o objeto do contrato (lista, texto, chave desconhecida) é 400.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import type { ReceivedByFields } from '../domain/received-by.policy.js'
import { normalizeReceivedBy } from './received-by.schema.js'

const RECEIVER_NAME_MAX_LENGTH = 120
const CONTROL_CHARACTERS = /\p{Cc}/gu

const proofReceiverBodySchema = z
  .object({
    receivedBy: z.unknown().optional(),
    receivedByDetail: z.unknown().optional(),
    receiverName: z.unknown().optional(),
  })
  .strict()

export type ProofReceiverPatch = {
  readonly receivedBy?: ReceivedByFields
  readonly receiverName?: string
}

export async function parseProofReceiverBody(request: Request): Promise<ProofReceiverPatch> {
  const body = await parseBody(proofReceiverBodySchema, request)
  const touchesReceivedBy = body.receivedBy !== undefined || body.receivedByDetail !== undefined

  return {
    ...(touchesReceivedBy
      ? {
          receivedBy: normalizeReceivedBy({
            receivedBy: body.receivedBy,
            receivedByDetail: body.receivedByDetail,
          }),
        }
      : {}),
    ...(typeof body.receiverName === 'string'
      ? {
          receiverName: body.receiverName
            .replace(CONTROL_CHARACTERS, '')
            .trim()
            .slice(0, RECEIVER_NAME_MAX_LENGTH),
        }
      : {}),
  }
}
