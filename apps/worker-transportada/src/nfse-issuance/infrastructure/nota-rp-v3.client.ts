/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Adaptador HTTP da Nota RP v3 (padrão nacional), com os mesmos outcomes da v2. Três regras:
 *
 * 1. **Decide o corpo, não o status**: `200` com `success:false` é recusa.
 * 2. **Nenhuma exceção escapa**: payload fora do formato vira recusa nomeada, rede vira `error`.
 * 3. **Ausência adia, nunca recusa** (ADR 0098 §7): nota que não se achou pode já estar autorizada.
 *
 * Ao contrário da v2, o corpo é montado aqui a partir do payload congelado (`plan.md`, spec 250).
 */
import {
  asRecord,
  createRedact,
  readEnvelope,
  readHttpRejection,
  readIdentifier,
  readJson,
  isRejectableClientError,
} from './nota-rp-v3-envelope.js'
import { readEnvelopedDocument } from './nota-rp-v3-document.reader.js'
import { buildIssueBody } from './nota-rp-v3-issue-body.mapper.js'
import { interpretListResponse } from './nota-rp-v3-status.mapper.js'
import { createNotaRpV3Transport, JSON_MEDIA_TYPE } from './nota-rp-v3-transport.js'
import type {
  NotaRpV3CancelParams,
  NotaRpV3Client,
  NotaRpV3Dependencies,
} from './nota-rp-v3.types.js'
import type { NotaRpCancelOutcome, NotaRpStatusOutcome } from './nota-rp-v2.client.js'

const CONFLICT_STATUS = 409
const NOT_FOUND_STATUS = 404
const DUPLICATE_INVOICE_DESCRIPTION = 'Nota duplicada'
const CANCELLATION_MOTIVE_NAME = {
  '2': { motivo: 'servico_nao_prestado' },
  '4': { descricao: DUPLICATE_INVOICE_DESCRIPTION, motivo: 'outros' },
} as const

export function createNotaRpV3Client(dependencies: NotaRpV3Dependencies): NotaRpV3Client {
  const { clock, config } = dependencies
  const transport = createNotaRpV3Transport(dependencies)
  const redact = createRedact([config.token, config.callbackToken])

  return {
    cancel: async (params) => {
      const sent = await transport.request({
        accept: JSON_MEDIA_TYPE,
        body: buildCancelBody(params),
        method: 'POST',
        path: '/nota/cancelar',
      })
      if (sent.kind === 'error') return { cause: sent.cause, status: 'error' }
      if (sent.kind === 'http') {
        return classifyCancelHttpFailure({
          providerDocumentId: params.providerDocumentId,
          response: sent.response,
        })
      }

      const envelope = await readEnvelope({ redact, response: sent.response })
      if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
      if (envelope.kind === 'rejected') return { rejection: envelope.rejection, status: 'rejected' }
      return { status: 'accepted' }
    },

    fetchDocument: async ({ kind, providerDocumentId }) => {
      const sent = await transport.request({
        accept: JSON_MEDIA_TYPE,
        method: 'GET',
        path: `/nota/${kind}`,
        query: { id_nota: providerDocumentId },
      })
      if (sent.kind === 'error') return { cause: sent.cause, status: 'error' }
      if (sent.kind === 'http') {
        const cause = sent.response.status === NOT_FOUND_STATUS ? 'not_found' : 'unexpected_status'
        return { cause, status: 'error' }
      }

      const envelope = await readEnvelope({ redact, response: sent.response })
      if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
      if (envelope.kind === 'rejected') return { rejection: envelope.rejection, status: 'rejected' }
      return readEnvelopedDocument({ envelope: envelope.data, kind })
    },

    fetchStatus: ({ providerDocumentId }) => queryStatus(providerDocumentId),

    issue: async ({ payload, providerDocumentId, providerRequestKey }) => {
      const built = buildIssueBody({
        callbackBaseUrl: config.callbackBaseUrl,
        callbackToken: config.callbackToken,
        issuedAt: clock(),
        payload,
        providerDocumentId,
        providerRequestKey,
      })
      if (built.kind === 'rejected') return { rejection: built.rejection, status: 'rejected' }

      const sent = await transport.request({
        accept: JSON_MEDIA_TYPE,
        body: built.body,
        method: 'POST',
        path: '/nota/emitir',
      })
      if (sent.kind === 'error') return { cause: sent.cause, status: 'error' }
      if (sent.kind === 'http') return classifyIssueHttpFailure(sent.response)

      const envelope = await readEnvelope({ redact, response: sent.response })
      if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
      if (envelope.kind === 'rejected') return { rejection: envelope.rejection, status: 'rejected' }
      return acceptedOrMalformed(envelope.data)
    },
  }

  async function classifyIssueHttpFailure(response: Response): ReturnType<NotaRpV3Client['issue']> {
    if (response.status === CONFLICT_STATUS) {
      const original = readIdentifier(asRecord(await readJson(response.clone())) ?? {}, 'id_nota')
      if (original !== undefined) return { providerDocumentId: original, status: 'accepted' }
    }
    if (!isRejectableClientError(response.status)) {
      return { cause: 'unexpected_status', status: 'error' }
    }
    return { rejection: await readHttpRejection({ redact, response }), status: 'rejected' }
  }

  async function queryStatus(providerDocumentId: string): Promise<NotaRpStatusOutcome> {
    const sent = await transport.request({
      accept: JSON_MEDIA_TYPE,
      method: 'GET',
      path: '/nota/listar',
      query: { id_nota: providerDocumentId },
    })
    if (sent.kind === 'error') return { cause: sent.cause, status: 'error' }
    if (sent.kind === 'http') {
      const cause = sent.response.status === NOT_FOUND_STATUS ? 'not_found' : 'unexpected_status'
      return { cause, status: 'error' }
    }

    const envelope = await readEnvelope({ redact, response: sent.response })
    if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
    /** Consulta que o provedor recusa não prova nada sobre a nota: adia. */
    if (envelope.kind === 'rejected') return { cause: 'unexpected_status', status: 'error' }
    return interpretListResponse({ data: envelope.data, providerDocumentId })
  }

  /** O 409 só vira `accepted` se a consulta provar a nota Cancelada; sem prova, nunca. */
  async function classifyCancelHttpFailure(input: {
    readonly providerDocumentId: string
    readonly response: Response
  }): Promise<NotaRpCancelOutcome> {
    if (input.response.status !== CONFLICT_STATUS) {
      return { cause: 'unexpected_status', status: 'error' }
    }

    const confirmation = await queryStatus(input.providerDocumentId)
    if (confirmation.status === 'cancelled') return { status: 'accepted' }
    if (confirmation.status === 'error') {
      return { cause: confirmation.cause ?? 'unexpected_status', status: 'error' }
    }
    return {
      rejection: await readHttpRejection({ redact, response: input.response }),
      status: 'rejected',
    }
  }
}

function acceptedOrMalformed(
  data: Readonly<Record<string, unknown>>,
): Awaited<ReturnType<NotaRpV3Client['issue']>> {
  const providerDocumentId = readIdentifier(data, 'id_nota')
  if (providerDocumentId === undefined) return { cause: 'malformed_response', status: 'error' }
  return { providerDocumentId, status: 'accepted' }
}

function buildCancelBody(params: NotaRpV3CancelParams): Readonly<Record<string, unknown>> {
  return {
    enviar_email: false,
    id_nota: Number(params.providerDocumentId),
    ...CANCELLATION_MOTIVE_NAME[params.cancellationMotive],
  }
}
