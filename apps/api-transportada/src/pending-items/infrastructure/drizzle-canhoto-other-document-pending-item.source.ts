/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d (D9): a foto de canhoto que parece ser de outra nota, para o escritório tratar vários
 * sem abrir viagem por viagem — "Aplicar" move (rota `proof/move`), "Descartar" mantém e some o
 * alerta (rota `proof/mismatch/dismiss`).
 *
 * O alerta continua **derivado**: o SQL só pré-filtra a divergência (a mesma conta de
 * `compareCanhotoReading`, presa por teste de paridade contra Postgres) e a nota citada sai de
 * `deriveCanhotoMismatches`, o mesmo código do detalhe da prova. Sempre da empresa do token.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  TRIP_DELIVERY_PROOF_CANHOTO_KIND,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
} from '../../database/trip.schema.js'
import { DELIVERED_EVENT_KIND } from '../../trips/domain/delivery-event.constant.js'
import { deriveCanhotoMismatches } from '../../trips/infrastructure/canhoto-mismatch.query.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type {
  ListPendingItemSourceInput,
  PendingItem,
  PendingItemPage,
  PendingItemSourcePort,
} from '../application/pending-item-source.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** O número sem zero à esquerda; "000" é zero, não vazio (`normalizeCanhotoDigits`). */
function normalizedDigits(column: SQL | SQL.Aliased | unknown): SQL {
  return sql`coalesce(nullif(ltrim(${column}, '0'), ''), '0')`
}

/**
 * Prova pendente, com leitura, não descartada, de nota viva, cuja leitura difere da própria nota
 * (número, ou série lida e diferente). Espelho em SQL de `compareCanhotoReading`.
 */
export function buildCanhotoOtherDocumentFilters(input: {
  readonly companyId: string
  readonly cursor: { readonly createdAt: Date; readonly id: string } | null
}): readonly SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(tripDeliveryProofs.companyId, input.companyId),
    eq(tripDeliveryProofs.kind, TRIP_DELIVERY_PROOF_CANHOTO_KIND),
    sql`${tripDeliveryProofs.canhotoReview} = 'pending'`,
    isNotNull(tripDeliveryProofs.canhotoReadNumber),
    sql`${tripDeliveryProofs.canhotoReadNumber} <> ''`,
    isNull(tripDeliveryProofs.canhotoMismatchDismissedAt),
    eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
    isNull(tripDocuments.releasedAt),
    isNotNull(nfeDocuments.number),
    or(
      sql`${normalizedDigits(tripDeliveryProofs.canhotoReadNumber)} <> ${normalizedDigits(nfeDocuments.number)}`,
      and(
        isNotNull(tripDeliveryProofs.canhotoReadSeries),
        sql`${tripDeliveryProofs.canhotoReadSeries} <> ''`,
        isNotNull(nfeDocuments.series),
        sql`${normalizedDigits(tripDeliveryProofs.canhotoReadSeries)} <> ${normalizedDigits(nfeDocuments.series)}`,
      ),
    ),
  ]
  if (input.cursor !== null) {
    filters.push(
      or(
        lt(tripDeliveryProofs.createdAt, input.cursor.createdAt),
        and(
          eq(tripDeliveryProofs.createdAt, input.cursor.createdAt),
          lt(tripDeliveryProofs.id, input.cursor.id),
        ),
      ),
    )
  }
  return filters.filter((filter): filter is SQL => filter !== undefined)
}

export function createCanhotoOtherDocumentPendingItemSource(dependencies: {
  readonly database: Database
}): PendingItemSourcePort {
  return {
    kind: 'canhotoOtherDocument',
    async list({ companyId, cursor, limit }: ListPendingItemSourceInput): Promise<PendingItemPage> {
      const rows = await dependencies.database
        .select({
          accessKey: nfeDocuments.accessKey,
          createdAt: tripDeliveryProofs.createdAt,
          documentId: tripDocuments.id,
          nfeDocumentId: nfeDocuments.id,
          number: nfeDocuments.number,
          proofId: tripDeliveryProofs.id,
          readNumber: tripDeliveryProofs.canhotoReadNumber,
          readSeries: tripDeliveryProofs.canhotoReadSeries,
          series: nfeDocuments.series,
          tripId: tripDocuments.tripId,
        })
        .from(tripDeliveryProofs)
        .innerJoin(
          tripStopEvents,
          and(
            eq(tripStopEvents.companyId, tripDeliveryProofs.companyId),
            eq(tripStopEvents.id, tripDeliveryProofs.stopEventId),
          ),
        )
        .innerJoin(
          tripDocuments,
          and(
            eq(tripDocuments.companyId, tripDeliveryProofs.companyId),
            eq(tripDocuments.id, tripStopEvents.tripDocumentId),
          ),
        )
        .innerJoin(
          nfeDocuments,
          and(
            eq(nfeDocuments.companyId, tripDocuments.companyId),
            eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
          ),
        )
        .where(
          and(
            ...buildCanhotoOtherDocumentFilters({ companyId, cursor: decodeKeysetCursor(cursor) }),
          ),
        )
        .orderBy(desc(tripDeliveryProofs.createdAt), desc(tripDeliveryProofs.id))
        .limit(limit + 1)

      const pageRows = rows.slice(0, limit)
      const mismatchByProof = await deriveMismatchesByProof(dependencies.database, {
        companyId,
        rows: pageRows,
      })
      const last = pageRows.at(-1)
      const items: PendingItem[] = pageRows.map((row) => {
        const mismatch = mismatchByProof.get(row.proofId) ?? null
        const matched = mismatch?.matchedDocument ?? null
        const movable =
          matched !== null &&
          matched.sameTrip &&
          matched.tripDocumentId !== null &&
          !matched.canhotoApproved
        return {
          createdAt: row.createdAt,
          details: {
            documentId: row.documentId,
            kind: mismatch?.kind ?? 'other_document',
            movable: movable ? 'true' : 'false',
            readNumber: row.readNumber ?? '',
            readSeries: row.readSeries,
            targetCanhotoApproved:
              matched === null ? null : matched.canhotoApproved ? 'true' : 'false',
            targetDocumentId: matched?.tripDocumentId ?? null,
            targetNumber: matched?.number ?? null,
            targetSameTrip: matched === null ? null : matched.sameTrip ? 'true' : 'false',
            targetSeries: matched?.series ?? null,
            tripId: row.tripId,
          },
          entityId: row.proofId,
          entityType: 'canhotoProof' as const,
          kind: 'canhotoOtherDocument' as const,
          label: row.number,
        }
      })
      return {
        items,
        nextCursor:
          rows.length > limit && last !== undefined
            ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.proofId })
            : null,
      }
    },
    requiredPermission: 'trip.manage',
  }
}

/** Uma derivação por viagem: a nota da mesma viagem vence a de outra (`pickCanhotoMismatchDocument`). */
async function deriveMismatchesByProof(
  database: Database,
  input: {
    readonly companyId: string
    readonly rows: readonly {
      readonly accessKey: string
      readonly nfeDocumentId: string
      readonly number: string
      readonly proofId: string
      readonly readNumber: null | string
      readonly readSeries: null | string
      readonly series: string
      readonly tripId: string
    }[]
  },
) {
  const byTrip = Map.groupBy(input.rows, (row) => row.tripId)
  const result = new Map<string, Awaited<ReturnType<typeof deriveCanhotoMismatches>>[number]>()
  for (const [tripId, rows] of byTrip) {
    const derived = await deriveCanhotoMismatches(database, {
      companyId: input.companyId,
      subjects: rows.map((row) => ({
        expectedAccessKey: row.accessKey,
        expectedNfeDocumentId: row.nfeDocumentId,
        expectedNumber: row.number,
        expectedSeries: row.series,
        readNumber: row.readNumber,
        readSeries: row.readSeries,
        review: 'pending' as const,
      })),
      tripId,
    })
    rows.forEach((row, index) => result.set(row.proofId, derived[index] ?? null))
  }
  return result
}
