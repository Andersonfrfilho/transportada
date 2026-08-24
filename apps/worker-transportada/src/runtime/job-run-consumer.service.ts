/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RabbitMqConsumer,
  RabbitMqDisposition,
  RabbitMqProvider,
} from '@adatechnology/rabbitmq-provider'
import type { z } from 'zod'

import type { JobCyclePort } from '../job-run/application/run-job-cycle.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import { jobRunEnvelopeV1Schema } from '../messaging/job-run-envelope.schema.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

const DECODE_FAILURE_MESSAGE = 'job_run_envelope_decode_failed'
const DECODE_FAILURE_REASON_LIMIT = 480
const ROOT_PATH = '<root>'
const UNRECOGNIZED_KEYS_CODE = 'unrecognized_keys'

export async function startJobRunConsumer(params: {
  readonly config: WorkerEnvironment
  readonly cycle: JobCyclePort
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  /** `decode` roda dentro do provider: um throw aqui mataria a mensagem sem log nem dead-letter. */
  return params.provider.consume<unknown>({
    decode: (value) => value,
    handler: async ({ payload: raw }) => {
      const decoded = jobRunEnvelopeV1Schema.safeParse(raw)
      if (!decoded.success) {
        return deadLetterUndecodableMessage({
          error: decoded.error,
          logger: params.logger,
          value: raw,
        })
      }

      const envelope = decoded.data

      safeLogInfo({
        logger: params.logger,
        message: 'job_run_consumer_received',
        metadata: {
          correlationId: envelope.correlationId,
          eventId: envelope.eventId,
          executionId: envelope.payload.executionId,
          job: envelope.payload.job,
          origin: envelope.payload.origin,
        },
      })

      /**
       * O ciclo já pousa todo imprevisto da rotina em `unexpected_error` com a linha fechada, então
       * o que escapa daqui é falha de banco — e essa merece a reentrega que o retry do trilho dá.
       */
      await params.cycle.run({ envelope })

      return { type: 'ack' }
    },
    prefetch: params.config.prefetch,
  })
}

/**
 * Envelope que o schema recusa é defeito de contrato, não falha transitória: reentregar repetiria a
 * recusa três vezes e sumiria com o motivo. A dead guarda a mensagem e o log guarda o **campo** —
 * nunca o conteúdo, que é o que separa diagnóstico de vazamento.
 */
function deadLetterUndecodableMessage(input: {
  readonly error: z.ZodError
  readonly logger: WorkerLogger
  readonly value: unknown
}): RabbitMqDisposition {
  safeLogError({
    logger: input.logger,
    message: DECODE_FAILURE_MESSAGE,
    metadata: {
      ...extractMessageKey(input.value),
      reason: describeDecodeFailure(input.error),
    },
  })

  return { type: 'dead-letter' }
}

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

/** Só identificador opaco: `correlationId` é texto que alguém escreveu, e texto não vai para o log. */
function extractMessageKey(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}

  const envelope = value as Record<string, unknown>
  const payload =
    typeof envelope.payload === 'object' && envelope.payload !== null
      ? (envelope.payload as Record<string, unknown>)
      : {}

  const eventId = readIdentifier(envelope.eventId)
  const executionId = readIdentifier(payload.executionId)

  return {
    ...(eventId === undefined ? {} : { eventId }),
    ...(executionId === undefined ? {} : { executionId }),
  }
}

function readIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
