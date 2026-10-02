/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  resolveRetentionCutoff,
  resolveTrackingPurgeCutoff,
  TRIP_DELIVERY_PROOFS_TABLE,
  TRIP_DOCUMENT_OCCURRENCES_TABLE,
  TRIP_LOCATION_PURGE_BATCH_SIZE,
  TRIP_LOCATION_PURGE_MAX_BATCHES,
  TRIP_LOCATION_RETENTION_DAYS,
  TRIP_STATUS_EVENTS_TABLE,
  TRIP_STOP_EVENTS_TABLE,
  TRIP_STOP_OCCURRENCES_TABLE,
  TRIP_TRACKING_MAX_AGE_HOURS,
} from '../domain/trip-location-purge.constant.js'
import type {
  PurgeStalePings,
  RedactDeliveryProofLocations,
  RedactDocumentOccurrenceLocations,
  RedactStatusEventLocations,
  RedactStopOccurrenceLocations,
  RedactTripLocations,
} from './trip-location.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'
const TABLE_FAILED_MESSAGE = 'trip_location_purge_table_failed'

export type TripLocationPurgeRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  /** ADR-0056 §2: o rastro ao vivo, com prazo próprio e muito mais curto que o da coordenada. */
  readonly purgeStalePings: PurgeStalePings
  readonly redact: RedactTripLocations
  /** Spec 196 D8: o ponto da ocorrência de nota, no mesmo corte de 90 dias. */
  readonly redactDocumentOccurrenceLocations: RedactDocumentOccurrenceLocations
  /** Spec 159 T11: a posição da foto do comprovante, no mesmo corte de 90 dias. */
  readonly redactProofLocations: RedactDeliveryProofLocations
  /** Spec 196 D8: o ponto da mudança de status da viagem, no mesmo corte de 90 dias. */
  readonly redactStatusEventLocations: RedactStatusEventLocations
  /** Spec 196 D8: o ponto da ocorrência de parada, no mesmo corte de 90 dias. */
  readonly redactStopOccurrenceLocations: RedactStopOccurrenceLocations
}

type TableRedactor = {
  readonly redact: RedactTripLocations
  readonly table: string
}

type RedactTableParams = {
  readonly before: Date
  readonly context: JobRoutineContext
  readonly logger: WorkerLogger
  readonly redactor: TableRedactor
}

type RedactTableResult = {
  readonly batches: number
  readonly exhausted: boolean
  readonly failed: boolean
  readonly redacted: number
}

/**
 * ADR-0045 §3.3: o prazo da coordenada só existe porque alguém o cumpre. Esta rotina é esse alguém.
 *
 * Ela não fala com ninguém de fora e não tem vocabulário de falha próprio: o que pode dar errado é o
 * imprevisto, e o invólucro já tem nome para ele.
 */
export function createTripLocationPurgeRoutine(
  dependencies: TripLocationPurgeRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

function listTableRedactors(dependencies: TripLocationPurgeRoutineDependencies): TableRedactor[] {
  return [
    { redact: dependencies.redact, table: TRIP_STOP_EVENTS_TABLE },
    { redact: dependencies.redactProofLocations, table: TRIP_DELIVERY_PROOFS_TABLE },
    { redact: dependencies.redactStatusEventLocations, table: TRIP_STATUS_EVENTS_TABLE },
    { redact: dependencies.redactStopOccurrenceLocations, table: TRIP_STOP_OCCURRENCES_TABLE },
    {
      redact: dependencies.redactDocumentOccurrenceLocations,
      table: TRIP_DOCUMENT_OCCURRENCES_TABLE,
    },
  ]
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: TripLocationPurgeRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const now = dependencies.now()
  const before = resolveRetentionCutoff(now)
  const redactedByTable: Record<string, number> = {}
  const exhaustedTables: string[] = []
  const failedTables: string[] = []
  let stopEventBatches = 0

  // Uma tabela por vez, de propósito: cinco varreduras em paralelo segurariam a escrita do motorista.
  for (const redactor of listTableRedactors(dependencies)) {
    const result = await redactTable({ before, context, logger: dependencies.logger, redactor })
    redactedByTable[redactor.table] = result.redacted
    if (result.exhausted) exhaustedTables.push(redactor.table)
    if (result.failed) failedTables.push(redactor.table)
    if (redactor.table === TRIP_STOP_EVENTS_TABLE) stopEventBatches = result.batches
  }

  /**
   * ADR-0056 §2: o rastro ao vivo, no mesmo ciclo e com corte próprio. Ele **não** depende de a
   * viagem fechar — `purgeByTrip` já cobre o fechamento, e o que sobra é justamente a viagem que
   * ninguém fechou, que com o segundo plano do aplicativo acompanha o motorista em casa.
   */
  const pingCutoff = resolveTrackingPurgeCutoff(now)
  let purgedPings = 0
  let pingBatches = 0

  while (pingBatches < TRIP_LOCATION_PURGE_MAX_BATCHES && !context.isStopRequested()) {
    const purged = await dependencies.purgeStalePings({
      before: pingCutoff,
      limit: TRIP_LOCATION_PURGE_BATCH_SIZE,
    })
    if (purged === 0) break
    purgedPings += purged
    pingBatches += 1
  }

  /**
   * O log conta quantas coordenadas caíram, de qual tabela e se sobrou fila — nunca qual evento, de
   * quem, nem onde. Um expurgo de PII que escreve a PII no log não expurgou nada.
   */
  safeLogInfo({
    logger: dependencies.logger,
    message: 'trip_location_purge_cycle_finished',
    metadata: {
      batches: stopEventBatches,
      correlationId: context.correlationId,
      executionId: context.executionId,
      exhausted: exhaustedTables.length > 0,
      exhaustedTables,
      failedTables,
      pingBatches,
      purgedPings,
      redacted: redactedByTable[TRIP_STOP_EVENTS_TABLE] ?? 0,
      redactedByTable,
      redactedProofs: redactedByTable[TRIP_DELIVERY_PROOFS_TABLE] ?? 0,
      retentionDays: TRIP_LOCATION_RETENTION_DAYS,
      trackingMaxAgeHours: TRIP_TRACKING_MAX_AGE_HOURS,
    },
  })

  return {
    counters: {
      batches: stopEventBatches,
      purgedPings,
      redacted: redactedByTable[TRIP_STOP_EVENTS_TABLE] ?? 0,
      redactedProofs: redactedByTable[TRIP_DELIVERY_PROOFS_TABLE] ?? 0,
    },
    outcome: COMPLETED_OUTCOME,
  }
}

/**
 * Cada tabela tem o próprio teto de lotes, e o erro de uma não impede as outras: a coluna ausente
 * (SQLSTATE `42703`, API ainda sem a migration) derrubaria o prazo das demais tabelas por causa de
 * uma. Parada é lida no limite do lote: o que já foi apagado está apagado, e o resto espera a batida.
 */
async function redactTable(params: RedactTableParams): Promise<RedactTableResult> {
  const { before, context, logger, redactor } = params
  let redacted = 0
  let batches = 0

  try {
    while (batches < TRIP_LOCATION_PURGE_MAX_BATCHES && !context.isStopRequested()) {
      const redactedInBatch = await redactor.redact({
        before,
        limit: TRIP_LOCATION_PURGE_BATCH_SIZE,
      })
      if (redactedInBatch === 0) break
      redacted += redactedInBatch
      batches += 1
    }
  } catch (error: unknown) {
    // Nunca a mensagem: o Postgres cita a linha inteira, coordenada incluída, no erro de CHECK.
    safeLogError({
      logger,
      message: TABLE_FAILED_MESSAGE,
      metadata: {
        correlationId: context.correlationId,
        executionId: context.executionId,
        sqlState: readSqlState(error),
        table: redactor.table,
      },
    })
    return { batches, exhausted: false, failed: true, redacted }
  }

  return { batches, exhausted: batches >= TRIP_LOCATION_PURGE_MAX_BATCHES, failed: false, redacted }
}

/** O driver embrulha o erro do Postgres em `cause`; o SQLSTATE é o que identifica a falha sem PII. */
function readSqlState(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code: unknown = Reflect.get(error, 'code')
  if (typeof code === 'string') return code
  return readSqlState(Reflect.get(error, 'cause'))
}
