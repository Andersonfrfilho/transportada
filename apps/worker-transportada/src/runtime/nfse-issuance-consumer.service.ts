/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RabbitMqConsumer,
  RabbitMqDisposition,
  RabbitMqProvider,
} from '@adatechnology/rabbitmq-provider'
import type { z } from 'zod'

import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import {
  NFSE_PROCESSING_EVENT_TYPE,
  nfseProcessingEnvelopeV1Schema,
} from '../messaging/nfse-processing-envelope.schema.js'
import type { NfseIssuanceConsumerEffect } from '../nfse-issuance/application/nfse-issuance-consumer.effect.js'
import {
  NfseIssuanceWorkerMessageHandler,
  type NfseIssuanceMessageKey,
  type NfseIssuanceWorkerRepository,
  type NfseRetryPolicyResolver,
} from '../nfse-issuance/application/nfse-issuance-worker-message-handler.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

const SUPPORTED_EVENT_TYPES: readonly string[] = Object.values(NFSE_PROCESSING_EVENT_TYPE)

const DECODE_FAILURE_MESSAGE = 'nfse_issuance_envelope_decode_failed'
const DECODE_FAILURE_REASON_LIMIT = 480
const ROOT_PATH = '<root>'
const UNRECOGNIZED_KEYS_CODE = 'unrecognized_keys'

export async function startNfseIssuanceConsumer(params: {
  readonly config: WorkerEnvironment
  readonly effect: NfseIssuanceConsumerEffect
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
  readonly repository: NfseIssuanceWorkerRepository
  readonly retryPolicyResolver: NfseRetryPolicyResolver
}): Promise<RabbitMqConsumer> {
  const handler = new NfseIssuanceWorkerMessageHandler({
    effect: params.effect,
    repository: params.repository,
    retryPolicyResolver: params.retryPolicyResolver,
  })

  /** `decode` roda dentro do provider: um throw aqui mataria a mensagem sem log nem dead-letter. */
  return params.provider.consume<unknown>({
    decode: (value) => value,
    handler: async ({ payload: raw, retryCount }) => {
      const attempt = typeof retryCount === 'number' ? retryCount : 0

      const decoded = nfseProcessingEnvelopeV1Schema.safeParse(raw)
      if (!decoded.success) {
        return deadLetterUndecodableMessage({
          error: decoded.error,
          logger: params.logger,
          repository: params.repository,
          value: raw,
        })
      }

      const payload = decoded.data

      if (!SUPPORTED_EVENT_TYPES.includes(payload.type)) {
        safeLogError({
          logger: params.logger,
          message: 'nfse_issuance_unexpected_event_type',
          metadata: { eventId: payload.eventId, type: payload.type },
        })
        return { type: 'dead-letter' }
      }

      safeLogInfo({
        logger: params.logger,
        message: 'nfse_issuance_consumer_received',
        metadata: {
          attemptId: payload.payload.attemptId,
          attemptKind: payload.payload.attemptKind,
          companyId: payload.companyId,
          eventId: payload.eventId,
          invoiceId: payload.payload.invoiceId,
        },
      })

      return handler.handle({ attempt, envelope: payload })
    },
    prefetch: params.config.prefetch,
  })
}

async function deadLetterUndecodableMessage(input: {
  readonly error: z.ZodError
  readonly logger: WorkerLogger
  readonly repository: NfseIssuanceWorkerRepository
  readonly value: unknown
}): Promise<RabbitMqDisposition> {
  const reason = describeDecodeFailure(input.error)
  const messageKey = extractMessageKey(input.value)

  safeLogError({
    logger: input.logger,
    message: DECODE_FAILURE_MESSAGE,
    metadata: { ...messageKey, reason },
  })

  if (messageKey !== undefined) {
    try {
      await input.repository.markDeadLettered({ ...messageKey, reason })
    } catch (error: unknown) {
      safeLogError({
        logger: input.logger,
        message: 'nfse_issuance_envelope_dead_letter_write_failed',
        metadata: {
          ...messageKey,
          reason: error instanceof Error ? error.name : 'UnknownError',
        },
      })
    }
  }

  return { type: 'dead-letter' }
}

/** Só caminhos e nomes de campo entram no motivo: o conteúdo do envelope pode carregar dado fiscal. */
function describeDecodeFailure(error: z.ZodError): string {
  const reason = error.issues
    .map((issue) => `${issue.code}@${describeIssueLocation(issue)}`)
    .join('; ')

  return reason.slice(0, DECODE_FAILURE_REASON_LIMIT)
}

function describeIssueLocation(issue: z.core.$ZodIssue): string {
  const path = issue.path.join('.')
  const keys = issue.code === UNRECOGNIZED_KEYS_CODE ? issue.keys.join(',') : ''
  const location = [path, keys].filter((part) => part !== '').join('.')

  return location === '' ? ROOT_PATH : location
}

function extractMessageKey(value: unknown): NfseIssuanceMessageKey | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const envelope = value as Record<string, unknown>
  const payload =
    typeof envelope.payload === 'object' && envelope.payload !== null
      ? (envelope.payload as Record<string, unknown>)
      : {}

  const attemptId = readIdentifier(payload.attemptId)
  const companyId = readIdentifier(envelope.companyId)
  const eventId = readIdentifier(envelope.eventId)
  const invoiceId = readIdentifier(payload.invoiceId)

  if (
    attemptId === undefined ||
    companyId === undefined ||
    eventId === undefined ||
    invoiceId === undefined
  ) {
    return undefined
  }

  return { attemptId, companyId, eventId, invoiceId }
}

function readIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
