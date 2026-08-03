/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RabbitMqConsumer,
  RabbitMqDisposition,
  RabbitMqProvider,
} from '@adatechnology/rabbitmq-provider'
import type { z } from 'zod'

import {
  MDFE_PROCESSING_EVENT_TYPE,
  mdfeProcessingEnvelopeV1Schema,
  type MdfeProcessingEnvelopeV1,
} from '../messaging/mdfe-processing-envelope.schema.js'
import {
  MdfeIssuanceWorkerMessageHandler,
  type MdfeRetryPolicyResolver,
} from '../mdfe-issuance/application/mdfe-issuance-worker-message-handler.service.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

const SUPPORTED_EVENT_TYPES: readonly string[] = Object.values(MDFE_PROCESSING_EVENT_TYPE)

const DECODE_FAILURE_MESSAGE = 'mdfe_issuance_envelope_decode_failed'
const DECODE_FAILURE_REASON_LIMIT = 480
const ROOT_PATH = '<root>'
const UNRECOGNIZED_KEYS_CODE = 'unrecognized_keys'

type MdfeIssuanceMessageKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly eventId: string
  readonly manifestId: string
}

type MdfeIssuanceWorkerRepository = {
  hasProcessed(params: MdfeIssuanceMessageKey): Promise<boolean>
  markDeadLettered(params: MdfeIssuanceMessageKey & { readonly reason: string }): Promise<void>
  markProcessed(params: MdfeIssuanceMessageKey): Promise<void>
  scheduleRetry(
    params: MdfeIssuanceMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
  ): Promise<void>
}

type MdfeIssuanceConsumerEffect = {
  execute(params: { readonly envelope: MdfeProcessingEnvelopeV1 }): Promise<void>
}

export async function startMdfeIssuanceConsumer(params: {
  readonly config: WorkerEnvironment
  readonly effect: MdfeIssuanceConsumerEffect
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
  readonly repository: MdfeIssuanceWorkerRepository
  readonly retryPolicyResolver: MdfeRetryPolicyResolver
}): Promise<RabbitMqConsumer> {
  const handler = new MdfeIssuanceWorkerMessageHandler({
    clock: { now: () => new Date() },
    effect: params.effect,
    repository: params.repository,
    retryPolicyResolver: params.retryPolicyResolver,
  })

  /** `decode` roda dentro do provider: um throw aqui mataria a mensagem sem log nem dead-letter. */
  return params.provider.consume<unknown>({
    decode: (value) => value,
    handler: async ({ payload: raw, retryCount }) => {
      const attempt = typeof retryCount === 'number' ? retryCount : 0

      const decoded = mdfeProcessingEnvelopeV1Schema.safeParse(raw)
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
          message: 'mdfe_issuance_unexpected_event_type',
          metadata: {
            eventId: payload.eventId,
            type: payload.type,
          },
        })
        return { type: 'dead-letter' }
      }

      safeLogInfo({
        logger: params.logger,
        message: 'mdfe_issuance_consumer_received',
        metadata: {
          attemptId: payload.payload.attemptId,
          attemptKind: payload.payload.attemptKind,
          companyId: payload.companyId,
          eventId: payload.eventId,
          manifestId: payload.payload.manifestId,
        },
      })

      return handler.handle({
        attempt,
        envelope: payload,
      })
    },
    prefetch: params.config.prefetch,
  })
}

async function deadLetterUndecodableMessage(input: {
  readonly error: z.ZodError
  readonly logger: WorkerLogger
  readonly repository: MdfeIssuanceWorkerRepository
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
        message: 'mdfe_issuance_envelope_dead_letter_write_failed',
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

function extractMessageKey(value: unknown): MdfeIssuanceMessageKey | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const envelope = value as Record<string, unknown>
  const payload =
    typeof envelope.payload === 'object' && envelope.payload !== null
      ? (envelope.payload as Record<string, unknown>)
      : {}

  const attemptId = readIdentifier(payload.attemptId)
  const companyId = readIdentifier(envelope.companyId)
  const eventId = readIdentifier(envelope.eventId)
  const manifestId = readIdentifier(payload.manifestId)

  if (
    attemptId === undefined ||
    companyId === undefined ||
    eventId === undefined ||
    manifestId === undefined
  ) {
    return undefined
  }

  return { attemptId, companyId, eventId, manifestId }
}

function readIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
