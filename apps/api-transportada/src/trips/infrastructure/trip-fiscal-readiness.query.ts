/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments, cteIssuanceAttempts } from '../../database/cte-issuance.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { mdfeManifests } from '../../database/mdfe.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type {
  TripDocumentReadiness,
  TripDocumentReadinessReason,
  TripFiscalReadinessPort,
} from '../application/read-trip-fiscal-readiness.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Manifesto que ainda vale. Depois de cancelado ou rejeitado a viagem pode manifestar de novo. */
const LIVE_MANIFEST_STATUSES = ['draft', 'issuing', 'authorized', 'closed'] as const

/** Tentativa que ainda pode virar autorização — nenhuma delas é bloqueio, todas são espera. */
const IN_PROGRESS_ATTEMPT_STATUSES = [
  'pending',
  'in_flight',
  'retry_scheduled',
  'reconciliation_required',
] as const

export class DrizzleTripFiscalReadinessQuery implements TripFiscalReadinessPort {
  public constructor(private readonly database: Database) {}

  /**
   * **Uma consulta para as N notas.** Com 200 notas numa viagem, o `left join` é a diferença entre
   * uma ida ao banco e duzentas — e é por isso que `cte_batch_items (company_id, nfe_document_id)`
   * nasceu nesta spec.
   *
   * A nota é alcançada pelos **dois** caminhos que `trip_documents` permite: o vínculo direto com a
   * NF-e e o vínculo por cálculo de frete, cujo `nfe_document_id` é `not null`. É o mesmo par que
   * `cteAuthorizedExpression()` já usa — construir um segundo caminho seria construí-lo diferente.
   */
  public async readDocumentReadiness(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripDocumentReadiness[] | null> {
    const [trip] = await this.database
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (trip === undefined) return null

    const rows = await this.database
      .select({
        attemptStatus: cteIssuanceAttempts.status,
        cteAccessKey: cteFiscalDocuments.accessKey,
        cteStatus: cteFiscalDocuments.status,
        rejectionCode: cteIssuanceAttempts.lastErrorCode,
        rejectionMessage: cteIssuanceAttempts.lastErrorCause,
        tripDocumentId: tripDocuments.id,
      })
      .from(tripDocuments)
      .leftJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, tripDocuments.companyId),
          eq(freightCalculations.id, tripDocuments.freightCalculationId),
        ),
      )
      .leftJoin(
        cteBatchItems,
        and(
          eq(cteBatchItems.companyId, tripDocuments.companyId),
          sql`${cteBatchItems.nfeDocumentId} in (${tripDocuments.nfeDocumentId}, ${freightCalculations.nfeDocumentId})`,
        ),
      )
      .leftJoin(
        cteFiscalDocuments,
        and(
          eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
          eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
        ),
      )
      .leftJoin(
        cteIssuanceAttempts,
        and(
          eq(cteIssuanceAttempts.companyId, cteBatchItems.companyId),
          eq(cteIssuanceAttempts.batchItemId, cteBatchItems.id),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.tripId, input.tripId),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .orderBy(desc(cteFiscalDocuments.authorizedAt))

    return collapseByDocument(rows)
  }

  public async hasLiveManifest(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [manifest] = await this.database
      .select({ id: mdfeManifests.id })
      .from(mdfeManifests)
      .where(
        and(
          eq(mdfeManifests.companyId, input.companyId),
          eq(mdfeManifests.tripId, input.tripId),
          inArray(mdfeManifests.status, [...LIVE_MANIFEST_STATUSES]),
        ),
      )
      .limit(1)

    return manifest !== undefined
  }
}

type ReadinessRow = {
  readonly attemptStatus: string | null
  readonly cteAccessKey: string | null
  readonly cteStatus: string | null
  readonly rejectionCode: string | null
  readonly rejectionMessage: string | null
  readonly tripDocumentId: string
}

/**
 * Uma nota pode ter várias tentativas e até um CT-e cancelado seguido de outro autorizado. A regra é
 * a do desfecho mais avançado: **autorizado vence tudo**, porque é o único estado que permite
 * manifestar; depois vem cancelado, depois em andamento, e a rejeição só sobra quando não houve
 * nenhum dos outros.
 */
function collapseByDocument(rows: readonly ReadinessRow[]): readonly TripDocumentReadiness[] {
  const byDocument = new Map<string, TripDocumentReadiness>()

  for (const row of rows) {
    const current = byDocument.get(row.tripDocumentId)
    const candidate = toReadiness(row)
    if (current === undefined || rankReason(candidate.reason) > rankReason(current.reason)) {
      byDocument.set(row.tripDocumentId, candidate)
    }
  }

  return [...byDocument.values()]
}

const REASON_RANK: Readonly<Record<TripDocumentReadinessReason, number>> = {
  no_cte: 0,
  cte_rejected: 1,
  cte_in_progress: 2,
  cte_cancelled: 3,
  ok: 4,
}

function rankReason(reason: TripDocumentReadinessReason): number {
  return REASON_RANK[reason]
}

function toReadiness(row: ReadinessRow): TripDocumentReadiness {
  const reason = toReason(row)
  /**
   * O erro da tentativa só é informação quando ele **é** o motivo. Uma nota autorizada depois de um
   * retry carrega o `lastErrorCode` da tentativa que falhou, e mostrá-lo ao lado de "ok" faria o
   * operador procurar problema numa nota resolvida.
   */
  const isRejection = reason === 'cte_rejected'

  return {
    cteAccessKey: reason === 'ok' ? row.cteAccessKey : null,
    reason,
    rejectionCode: isRejection ? row.rejectionCode : null,
    rejectionMessage: isRejection ? row.rejectionMessage : null,
    tripDocumentId: row.tripDocumentId,
  }
}

function toReason(row: ReadinessRow): TripDocumentReadinessReason {
  if (row.cteStatus === 'authorized') return 'ok'
  if (row.cteStatus === 'cancelled') return 'cte_cancelled'
  if (row.attemptStatus === 'rejected' || row.attemptStatus === 'failed') return 'cte_rejected'
  if (
    row.attemptStatus !== null &&
    (IN_PROGRESS_ATTEMPT_STATUSES as readonly string[]).includes(row.attemptStatus)
  ) {
    return 'cte_in_progress'
  }

  return 'no_cte'
}
