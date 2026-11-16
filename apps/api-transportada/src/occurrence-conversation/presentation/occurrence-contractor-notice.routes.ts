/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 (T1): o botão "Avisar a contratante" da ocorrência de nota. Manda **uma vez** o mesmo aviso que o automático
 * mandaria (mesmo modelo, mesmo canal: grupo da 318 ou e-mail aos contatos da etapa), mesmo com o tipo desligado.
 *
 * - Permissão: a mesma de escrever à contratante na conversa (`occurrences.resolve`, D9); nenhuma nova.
 * - Corpo vazio e estrito: o canal e o texto são do servidor, nunca do cliente (D2). `companyId` e o autor vêm do
 *   contexto.
 * - 409 `OCCURRENCE_CONTRACTOR_NOTICE_BLOCKED` no tipo marcado pela 321 (RF6); 409
 *   `OCCURRENCE_CONTRACTOR_NOTICE_ALREADY_SENT` quando o automático ou o próprio botão já avisou (D3, D8); 404 para
 *   ocorrência de parada, sem contratante casada ou de outra empresa.
 * - 200 com o desfecho: `sent` (e-mail), `sent_to_group`, `group_failed` (com a reserva por e-mail, se saiu) ou
 *   `skipped` com o motivo (D6: sem destinatário, e-mail não configurado, sem modelo). Só `sent`/`sent_to_group`/a
 *   reserva enviada fecham o aviso; o resto libera tentar de novo.
 * - Manda e-mail: conta no balde Postgres das mensagens da ocorrência (`test/rate-limited-routes.contract.test.ts`).
 */
import { z } from 'zod'

import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import type {
  ManualNoticeState,
  ManualOccurrenceNoticeResult,
} from '../application/send-automatic-occurrence-mail.use-case.js'
import {
  OccurrenceContractorNoticeAlreadySentError,
  OccurrenceContractorNoticeBlockedError,
} from '../domain/occurrence-conversation.error.js'
import { OCCURRENCE_CONVERSATION_RATE_LIMIT } from './occurrence-conversation.routes.js'

export const OCCURRENCE_CONTRACTOR_NOTICE_PATH = '/trip-occurrences/:id/contractor-notice'

const CONTRACTOR_NOTICE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const EMPTY_BODY_SCHEMA = z.object({}).strict().readonly()

export type OccurrenceContractorNoticeRoutesDependencies = {
  readonly sendManualNotice: {
    /** Spec 324 T3: o estado do botão; `null` sem ocorrência de nota. */
    readNoticeState(input: {
      readonly companyId: string
      readonly occurrenceId: string
    }): Promise<ManualNoticeState | null>
    sendManual(input: {
      readonly actorUserId: string
      readonly companyId: string
      readonly correlationId: string
      readonly occurrenceId: string
    }): Promise<ManualOccurrenceNoticeResult>
  }
}

type ContractorNoticeRouteInput = {
  readonly correlationId: string
  readonly occurrenceId: string
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify({ data: body }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

export function createOccurrenceContractorNoticeRoutes(
  dependencies: OccurrenceContractorNoticeRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    /**
     * Spec 324 T3 (RF1/RF4/D6): o estado do botão, com a mesma permissão do envio — quem não pode avisar não precisa
     * do estado, e o painel o relê ao abrir o diálogo (o canal pode ter mudado). Só leitura, sem corpo.
     */
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }) {
        const state = await dependencies.sendManualNotice.readNoticeState({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        if (state === null) throw new TripOccurrenceNotFoundError()
        return jsonResponse(state)
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_NOTICE_PATH,
      policy: CONTRACTOR_NOTICE_POLICY,
    }),
    defineRoute<ContractorNoticeRouteInput>({
      async handle({ context, input }) {
        const result = await dependencies.sendManualNotice.sendManual({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          occurrenceId: input.occurrenceId,
        })
        if (result.outcome === 'not_document') throw new TripOccurrenceNotFoundError()
        if (result.outcome === 'blocked') throw new OccurrenceContractorNoticeBlockedError()
        if (result.outcome === 'already_notified') {
          throw new OccurrenceContractorNoticeAlreadySentError(result.by)
        }
        return jsonResponse(result)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        await parseOptionalBody(EMPTY_BODY_SCHEMA, request)
        return { correlationId, occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: OCCURRENCE_CONTRACTOR_NOTICE_PATH,
      policy: CONTRACTOR_NOTICE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
  ]
}
