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
  resolveTrackingPurgeCutoff,
  TRIP_DELIVERY_PROOFS_TABLE,
  TRIP_DOCUMENT_OCCURRENCES_TABLE,
  TRIP_LOCATION_PURGE_BATCH_SIZE,
  TRIP_LOCATION_PURGE_MAX_BATCHES,
  TRIP_STATUS_EVENTS_TABLE,
  TRIP_STOP_EVENTS_TABLE,
  TRIP_STOP_OCCURRENCES_TABLE,
  TRIP_TRACKING_MAX_AGE_HOURS,
} from '../domain/trip-location-purge.constant.js'
import type {
  CountEligibleCompanies,
  PurgeStalePings,
  RedactDeliveryProofLocations,
  RedactDocumentOccurrenceLocations,
  RedactStatusEventLocations,
  RedactStopOccurrenceLocations,
  RedactTripLocations,
} from './trip-location.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'
const TABLE_FAILED_MESSAGE = 'trip_location_purge_table_failed'
const DISABLED_MESSAGE = 'trip_location_purge_disabled'

export type TripLocationPurgeRoutineDependencies = {
  /**
   * Spec 239 D3: quem liga o expurgo é a empresa, na tela. Obrigatório de propósito — sem esta contagem a
   * rotina não teria como saber que ninguém ligou, e uma fiação esquecida varreria as cinco tabelas à toa.
   */
  readonly countEligibleCompanies: CountEligibleCompanies
  readonly logger: WorkerLogger
  readonly now: () => Date
  /** ADR-0056 §2: o rastro ao vivo, com prazo próprio e muito mais curto que o da coordenada. */
  readonly purgeStalePings: PurgeStalePings
  readonly redact: RedactTripLocations
  /** Spec 196 D8: o ponto da ocorrência de nota, no prazo da empresa. */
  readonly redactDocumentOccurrenceLocations: RedactDocumentOccurrenceLocations
  /** Spec 159 T11: a posição da foto do comprovante, no prazo da empresa. */
  readonly redactProofLocations: RedactDeliveryProofLocations
  /** Spec 196 D8: o ponto da mudança de status da viagem, no prazo da empresa. */
  readonly redactStatusEventLocations: RedactStatusEventLocations
  /** Spec 196 D8: o ponto da ocorrência de parada, no prazo da empresa. */
  readonly redactStopOccurrenceLocations: RedactStopOccurrenceLocations
}

type TableRedactor = {
  readonly redact: RedactTripLocations
  readonly table: string
}

type RedactTableParams = {
  readonly context: JobRoutineContext
  readonly logger: WorkerLogger
  readonly now: Date
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

  /**
   * ADR-0056 §2: o rastro ao vivo vence **antes** e **fora** do prazo da empresa. O expurgo das cinco
   * tabelas de evento é decisão de cada empresa (spec 239): ping vencido é posição contínua do motorista
   * em casa e nunca esperou configuração. Ele **não** depende de a viagem fechar — `purgeByTrip` já cobre
   * o fechamento, e o que sobra é a viagem que ninguém fechou.
   */
  const { batches: pingBatches, purged: purgedPings } = await purgeStalePingsLoop({
    context,
    dependencies,
    now,
  })

  /**
   * A contagem usa o mesmo `now` dos redatores: um instante por ciclo. Se ela lançar (tabela de
   * configuração ausente, deploy fora de ordem), o ciclo falha inteiro e nada é apagado — os pings já
   * rodaram, e eles não dependem da configuração.
   */
  const companies = await dependencies.countEligibleCompanies({ now })

  /**
   * Ninguém elegível não é "rodou e não achou nada": nenhuma leitura, nenhum lote, nenhuma escrita nas
   * cinco tabelas de evento. O ciclo fecha `succeeded` porque não houve falha — e o log diz por que não
   * redigiu nada, senão a próxima pessoa a investigar "o expurgo parou" não tem como saber que foi de
   * propósito.
   */
  if (companies === 0) {
    safeLogInfo({
      logger: dependencies.logger,
      message: DISABLED_MESSAGE,
      metadata: {
        companies,
        correlationId: context.correlationId,
        executionId: context.executionId,
        pingBatches,
        purgedPings,
      },
    })

    return {
      counters: { batches: 0, purgedPings, redacted: 0, redactedProofs: 0 },
      outcome: COMPLETED_OUTCOME,
    }
  }

  const redactedByTable: Record<string, number> = {}
  const exhaustedTables: string[] = []
  const failedTables: string[] = []
  let stopEventBatches = 0

  // Uma tabela por vez, de propósito: cinco varreduras em paralelo segurariam a escrita do motorista.
  for (const redactor of listTableRedactors(dependencies)) {
    const result = await redactTable({ context, logger: dependencies.logger, now, redactor })
    redactedByTable[redactor.table] = result.redacted
    if (result.exhausted) exhaustedTables.push(redactor.table)
    if (result.failed) failedTables.push(redactor.table)
    if (redactor.table === TRIP_STOP_EVENTS_TABLE) stopEventBatches = result.batches
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
      companies,
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

async function purgeStalePingsLoop(input: {
  readonly context: JobRoutineContext
  readonly dependencies: TripLocationPurgeRoutineDependencies
  readonly now: Date
}): Promise<{ readonly batches: number; readonly purged: number }> {
  const { context, dependencies, now } = input
  const cutoff = resolveTrackingPurgeCutoff(now)
  let purged = 0
  let batches = 0

  while (batches < TRIP_LOCATION_PURGE_MAX_BATCHES && !context.isStopRequested()) {
    const purgedInBatch = await dependencies.purgeStalePings({
      before: cutoff,
      limit: TRIP_LOCATION_PURGE_BATCH_SIZE,
    })
    if (purgedInBatch === 0) break
    purged += purgedInBatch
    batches += 1
  }

  return { batches, purged }
}

/**
 * Cada tabela tem o próprio teto de lotes, e o erro de uma não impede as outras: a coluna ausente
 * (SQLSTATE `42703`, API ainda sem a migration) derrubaria o prazo das demais tabelas por causa de
 * uma. Parada é lida no limite do lote: o que já foi apagado está apagado, e o resto espera a batida.
 */
async function redactTable(params: RedactTableParams): Promise<RedactTableResult> {
  const { context, logger, now, redactor } = params
  let redacted = 0
  let batches = 0

  try {
    while (batches < TRIP_LOCATION_PURGE_MAX_BATCHES && !context.isStopRequested()) {
      const redactedInBatch = await redactor.redact({
        now,
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
