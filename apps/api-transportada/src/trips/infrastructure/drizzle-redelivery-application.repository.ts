/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14b (RF18/RF19): escritor único de `redelivery_application` — executa a proposta de
 * reentrega e registra o fato na mesma transação. Molde de `DrizzleOccurrenceCaseRepository.transition`
 * (lock + recheck) e de `DrizzleTripRouteRepository.reorderStops` (a mesma `writeStopOrder`, nunca
 * uma escrita nova em `trip_stops`).
 *
 * ⚠️ **Ordem de lock fixada: `trips` primeiro, tratativa depois.** Inverter dá deadlock contra o
 * despacho (`DrizzleTripRepository.close`/`dispatch`, que trava `trips` antes de qualquer outra
 * linha). O `select` que resolve qual viagem travar (a partir da ocorrência) é **sem lock**, feito
 * antes de abrir a transação de escrita.
 *
 * A proposta é recalculada **depois** dos dois locks, com `checkTripAcceptsLinkage` rodando sobre o
 * status travado — fecha o TOCTOU que `readStopOrderPreconditions` (`drizzle-trip-route.repository.ts`)
 * ainda tem fora desta task: a leitura de precondição aqui está dentro da mesma transação que
 * trava `trips`, não antes dela.
 */
import { and, asc, eq, isNull, ne } from 'drizzle-orm'

import {
  tripDocumentOccurrences,
  tripDocuments,
  tripOccurrenceCases,
  tripStops,
  trips,
} from '../../database/trip.schema.js'
import type { TripOccurrenceCaseRedeliveryApplication } from '../../database/trip.schema.js'
import { resolveRedeliveryProposal } from '../domain/redelivery-proposal.policy.js'
import {
  OccurrenceCaseNotFoundError,
  OccurrenceCaseTransitionNotAllowedError,
} from '../domain/trip.error.js'
import type { RedeliveryApplicationPort } from '../application/redelivery-application.use-case.js'
import { releaseLiveLink } from './trip-document-review-link.support.js'
import { writeStopOrder } from './drizzle-trip-route.repository.js'
import type { RequestCargoLayoutForTrip } from './eager-cargo-layout-request.support.js'
import { createRequestCargoLayoutForTrip } from './eager-cargo-layout-request.support.js'
import type { CargoLayoutLeaseOptions } from '../application/cargo-layout-request.types.js'
import { DEFAULT_CARGO_LAYOUT_LEASE_MS } from '../domain/cargo-layout-lease.policy.js'
import type { TripDatabase, TripTransaction } from './trip-queryable.type.js'

function mapApplication(
  kind: 'refused' | 'release_document' | 'reorder_stop',
): TripOccurrenceCaseRedeliveryApplication {
  if (kind === 'reorder_stop') return 'reordered'
  if (kind === 'release_document') return 'released'
  return 'refused'
}

export class DrizzleRedeliveryApplicationRepository implements RedeliveryApplicationPort {
  private readonly requestCargoLayoutForTrip: RequestCargoLayoutForTrip

  public constructor(
    private readonly database: TripDatabase,
    options: CargoLayoutLeaseOptions = { cargoLayoutLeaseMs: DEFAULT_CARGO_LAYOUT_LEASE_MS },
  ) {
    this.requestCargoLayoutForTrip = createRequestCargoLayoutForTrip(options)
  }

  public async applyRedeliveryApplication(input: {
    readonly actorUserId: string
    readonly caseId: string
    readonly companyId: string
  }): Promise<{ readonly application: TripOccurrenceCaseRedeliveryApplication }> {
    const { actorUserId, caseId, companyId } = input

    const [caseRow] = await this.database
      .select({ occurrenceId: tripOccurrenceCases.occurrenceId })
      .from(tripOccurrenceCases)
      .where(and(eq(tripOccurrenceCases.companyId, companyId), eq(tripOccurrenceCases.id, caseId)))
      .limit(1)
    if (caseRow === undefined) throw new OccurrenceCaseNotFoundError()

    const [documentRow] = await this.database
      .select({ tripDocumentId: tripDocuments.id, tripId: tripDocuments.tripId })
      .from(tripDocumentOccurrences)
      .innerJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
          eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
        ),
      )
      .where(
        and(
          eq(tripDocumentOccurrences.companyId, companyId),
          eq(tripDocumentOccurrences.id, caseRow.occurrenceId),
        ),
      )
      .limit(1)
    if (documentRow === undefined) throw new OccurrenceCaseNotFoundError()

    return this.database.transaction(async (transaction) => {
      const [tripRow] = await transaction
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, companyId), eq(trips.id, documentRow.tripId)))
        .for('no key update')
        .limit(1)
      if (tripRow === undefined) throw new OccurrenceCaseNotFoundError()

      const [lockedCase] = await transaction
        .select({
          decisionKind: tripOccurrenceCases.decisionKind,
          redeliveryApplication: tripOccurrenceCases.redeliveryApplication,
        })
        .from(tripOccurrenceCases)
        .where(
          and(eq(tripOccurrenceCases.companyId, companyId), eq(tripOccurrenceCases.id, caseId)),
        )
        .for('no key update')
        .limit(1)
      if (lockedCase === undefined) throw new OccurrenceCaseNotFoundError()
      if (
        lockedCase.redeliveryApplication !== null ||
        lockedCase.decisionKind !== 'redelivery_authorized'
      ) {
        throw new OccurrenceCaseTransitionNotAllowedError()
      }

      const [freshDocument] = await transaction
        .select({ releasedAt: tripDocuments.releasedAt, stopId: tripDocuments.stopId })
        .from(tripDocuments)
        .where(
          and(
            eq(tripDocuments.companyId, companyId),
            eq(tripDocuments.id, documentRow.tripDocumentId),
          ),
        )
        .limit(1)
      if (freshDocument === undefined) throw new OccurrenceCaseNotFoundError()

      const currentStopIds =
        freshDocument.stopId === null
          ? []
          : await readStopIds(transaction, {
              companyId,
              tripId: documentRow.tripId,
            })
      const otherLiveDocumentsAtStop =
        freshDocument.stopId === null
          ? 0
          : await countOtherLiveDocumentsAtStop(transaction, {
              companyId,
              excludingTripDocumentId: documentRow.tripDocumentId,
              stopId: freshDocument.stopId,
            })

      const proposal = resolveRedeliveryProposal({
        currentStopIds,
        documentReleased: freshDocument.releasedAt !== null,
        otherLiveDocumentsAtStop,
        stopId: freshDocument.stopId,
        tripStatus: tripRow.status,
      })

      if (proposal.kind === 'reorder_stop') {
        await writeStopOrder(transaction, {
          companyId,
          orderedStopIds: proposal.orderedStopIds,
          tripId: documentRow.tripId,
        })
        await this.requestCargoLayoutForTrip(transaction, {
          companyId,
          tripId: documentRow.tripId,
        })
      } else if (proposal.kind === 'release_document') {
        await releaseLiveLink(transaction, {
          companyId,
          tripDocumentId: documentRow.tripDocumentId,
        })
      }

      const application = mapApplication(proposal.kind)

      const updated = await transaction
        .update(tripOccurrenceCases)
        .set({
          redeliveryAppliedAt: new Date(),
          redeliveryAppliedByUserId: actorUserId,
          redeliveryApplication: application,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tripOccurrenceCases.companyId, companyId),
            eq(tripOccurrenceCases.id, caseId),
            isNull(tripOccurrenceCases.redeliveryApplication),
          ),
        )
        .returning({ id: tripOccurrenceCases.id })
      if (updated.length === 0) throw new OccurrenceCaseTransitionNotAllowedError()

      return { application }
    })
  }
}

async function readStopIds(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly string[]> {
  const rows = await transaction
    .select({ id: tripStops.id })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
    .orderBy(asc(tripStops.sequence))
  return rows.map((row) => row.id)
}

async function countOtherLiveDocumentsAtStop(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly excludingTripDocumentId: string
    readonly stopId: string
  },
): Promise<number> {
  const rows = await transaction
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.stopId, input.stopId),
        isNull(tripDocuments.releasedAt),
        ne(tripDocuments.id, input.excludingTripDocumentId),
      ),
    )
  return rows.length
}
