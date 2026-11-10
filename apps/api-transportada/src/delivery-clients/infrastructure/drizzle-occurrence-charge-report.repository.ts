/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T19. A consulta serve `delivery_charges_contractor_period_idx`
 * (`company_id, contractor_id, charged_on`, criada na T16) — `contractorId`/`chargedOn` entram
 * sempre no `where`, então o índice cobre o recorte mais comum mesmo quando o operador não filtra
 * por contratante (a igualdade por `companyId` já restringe o exame ao prefixo do índice).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  and,
  asc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'

import { deliveryCharges } from '../../database/delivery-client.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { StopOccurrencePaidBy } from '../../database/trip.schema.js'
import type { PixKeyType } from '../../shared/pix-key-type.constant.js'
import {
  companyOccurrenceTypePhotoSlots,
  tripDocuments,
  tripOccurrenceCases,
  tripOccurrenceItemSettlements,
  tripStopOccurrencePhotos,
  tripStopOccurrences,
} from '../../database/trip.schema.js'
import type {
  OccurrenceChargeReportFilters,
  OccurrenceChargeReportPhotoLocation,
  OccurrenceChargeReportPort,
  OccurrenceChargeReportRecord,
  OccurrenceChargeReportRecordPage,
} from '../application/occurrence-charge-report.port.js'

/**
 * Spec 317 (T6): a cobrança no recebimento é de ocorrência de parada (`stop_occurrence_id`), não de nota. Entra no
 * recorte pelo tipo — as sugestões antigas de parada (spec 060 D4c, `occurrence_fee`) continuam fora, como sempre.
 */
const RECEIVING_CHARGE_TYPE = 'receiving_charge'
const DELETED_OBJECT_STATUS = 'deleted'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleOccurrenceChargeReportRepository implements OccurrenceChargeReportPort {
  public constructor(private readonly database: Database) {}

  public async read(input: {
    readonly companyId: string
    readonly filters: OccurrenceChargeReportFilters
  }): Promise<OccurrenceChargeReportRecordPage> {
    const { filters } = input

    const settlementExists = exists(
      this.database
        .select({ id: tripOccurrenceCases.id })
        .from(tripOccurrenceCases)
        .innerJoin(
          tripOccurrenceItemSettlements,
          and(
            eq(tripOccurrenceItemSettlements.companyId, tripOccurrenceCases.companyId),
            eq(tripOccurrenceItemSettlements.caseId, tripOccurrenceCases.id),
          ),
        )
        .where(
          and(
            eq(tripOccurrenceCases.companyId, deliveryCharges.companyId),
            eq(tripOccurrenceCases.occurrenceId, deliveryCharges.occurrenceId),
          ),
        ),
    )

    /** Condições do recorte inteiro (sem o cursor) — usadas tanto na página quanto nos totais. */
    const scope = and(
      eq(deliveryCharges.companyId, input.companyId),
      or(
        sql`${deliveryCharges.occurrenceId} is not null`,
        eq(deliveryCharges.chargeType, RECEIVING_CHARGE_TYPE),
      ) as SQL,
      isNull(deliveryCharges.batchId),
      ...(filters.contractorId === undefined
        ? []
        : [eq(deliveryCharges.contractorId, filters.contractorId)]),
      ...(filters.from === undefined ? [] : [gte(deliveryCharges.chargedOn, filters.from)]),
      ...(filters.to === undefined ? [] : [lte(deliveryCharges.chargedOn, filters.to)]),
      ...(filters.chargeType === undefined
        ? []
        : [eq(deliveryCharges.chargeType, filters.chargeType)]),
      ...(filters.status === undefined ? [] : [eq(deliveryCharges.status, filters.status)]),
      ...(filters.hasSettlement === undefined
        ? []
        : [filters.hasSettlement ? settlementExists : sql`not ${settlementExists}`]),
      ...(filters.search === undefined || filters.search.length === 0
        ? []
        : [
            or(
              ilike(nfeDocuments.accessKey, `%${filters.search}%`),
              ilike(nfeDocuments.number, `%${filters.search}%`),
            ) as SQL,
          ]),
    ) as SQL

    const pageWhere =
      filters.cursor === undefined ? scope : and(scope, gt(deliveryCharges.id, filters.cursor))

    const rows = await this.database
      .select({
        accessKey: nfeDocuments.accessKey,
        amount: deliveryCharges.amount,
        chargeType: deliveryCharges.chargeType,
        chargedOn: deliveryCharges.chargedOn,
        contractorId: deliveryCharges.contractorId,
        hasSettlement: sql<boolean>`${settlementExists}`,
        id: deliveryCharges.id,
        noteNumber: nfeDocuments.number,
        noteSeries: nfeDocuments.series,
        occurrenceId: deliveryCharges.occurrenceId,
        status: deliveryCharges.status,
        stopDriverPayoutSentAt: tripStopOccurrences.driverPayoutSentAt,
        stopDriverPixKey: tripStopOccurrences.driverPixKey,
        stopDriverPixKeyType: tripStopOccurrences.driverPixKeyType,
        stopOccurrenceId: deliveryCharges.stopOccurrenceId,
        stopPaidBy: tripStopOccurrences.paidBy,
        tripDocumentId: deliveryCharges.tripDocumentId,
        tripId: deliveryCharges.tripId,
      })
      .from(deliveryCharges)
      .leftJoin(tripDocuments, eq(tripDocuments.id, deliveryCharges.tripDocumentId))
      .leftJoin(nfeDocuments, eq(nfeDocuments.id, tripDocuments.nfeDocumentId))
      .leftJoin(
        tripStopOccurrences,
        and(
          eq(tripStopOccurrences.companyId, deliveryCharges.companyId),
          eq(tripStopOccurrences.id, deliveryCharges.stopOccurrenceId),
        ),
      )
      .where(pageWhere)
      .orderBy(asc(deliveryCharges.id))
      .limit(filters.limit + 1)

    const page = rows.slice(0, filters.limit)
    const photos = await this.readPhotos(input.companyId, page)

    const totalsRows = await this.database
      .select({
        amount: sql<string>`coalesce(sum(${deliveryCharges.amount}), 0)::text`,
        chargeType: deliveryCharges.chargeType,
        count: sql<string>`count(*)::text`,
      })
      .from(deliveryCharges)
      .leftJoin(tripDocuments, eq(tripDocuments.id, deliveryCharges.tripDocumentId))
      .leftJoin(nfeDocuments, eq(nfeDocuments.id, tripDocuments.nfeDocumentId))
      .where(scope)
      .groupBy(deliveryCharges.chargeType)

    const totals = {
      byChargeType: totalsRows.map((row) => ({
        amount: row.amount,
        chargeType: row.chargeType,
        count: Number(row.count),
      })),
      totalAmount: totalsRows
        .reduce((accumulated, row) => accumulated + Number(row.amount), 0)
        .toFixed(4),
      totalCount: totalsRows.reduce((accumulated, row) => accumulated + Number(row.count), 0),
    }

    return {
      items: page.map((row) => toRecord(row, photos.get(row.stopOccurrenceId ?? '') ?? [])),
      nextCursor: rows.length > filters.limit ? (page.at(-1)?.id ?? null) : null,
      totals,
    }
  }

  /**
   * Uma consulta para a página inteira: as fotos das ocorrências de parada da página, com o rótulo da vaga do tipo
   * (vaga apagada do tipo cai na chave) e só objeto vivo. Tudo dentro da empresa do contexto.
   */
  private async readPhotos(
    companyId: string,
    page: readonly { readonly stopOccurrenceId: string | null }[],
  ): Promise<ReadonlyMap<string, readonly OccurrenceChargeReportPhotoLocation[]>> {
    const ids = [
      ...new Set(
        page.flatMap((row) => (row.stopOccurrenceId === null ? [] : [row.stopOccurrenceId])),
      ),
    ]
    const byOccurrence = new Map<string, OccurrenceChargeReportPhotoLocation[]>()
    if (ids.length === 0) return byOccurrence

    const photoRows = await this.database
      .select({
        bucket: storedObjects.bucket,
        label: companyOccurrenceTypePhotoSlots.label,
        objectKey: storedObjects.objectKey,
        slotKey: tripStopOccurrencePhotos.slotKey,
        stopOccurrenceId: tripStopOccurrencePhotos.stopOccurrenceId,
      })
      .from(tripStopOccurrencePhotos)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.companyId, tripStopOccurrencePhotos.companyId),
          eq(storedObjects.id, tripStopOccurrencePhotos.objectId),
          ne(storedObjects.status, DELETED_OBJECT_STATUS),
        ),
      )
      .innerJoin(
        tripStopOccurrences,
        and(
          eq(tripStopOccurrences.companyId, tripStopOccurrencePhotos.companyId),
          eq(tripStopOccurrences.id, tripStopOccurrencePhotos.stopOccurrenceId),
        ),
      )
      .leftJoin(
        companyOccurrenceTypePhotoSlots,
        and(
          eq(companyOccurrenceTypePhotoSlots.companyId, tripStopOccurrences.companyId),
          eq(
            companyOccurrenceTypePhotoSlots.occurrenceTypeId,
            tripStopOccurrences.occurrenceTypeId,
          ),
          eq(companyOccurrenceTypePhotoSlots.slotKey, tripStopOccurrencePhotos.slotKey),
        ),
      )
      .where(
        and(
          eq(tripStopOccurrencePhotos.companyId, companyId),
          inArray(tripStopOccurrencePhotos.stopOccurrenceId, ids),
        ),
      )
      .orderBy(asc(tripStopOccurrencePhotos.position), asc(tripStopOccurrencePhotos.slotKey))

    for (const photo of photoRows) {
      const list = byOccurrence.get(photo.stopOccurrenceId) ?? []
      list.push({
        bucket: photo.bucket,
        label: photo.label ?? photo.slotKey,
        objectKey: photo.objectKey,
        slotKey: photo.slotKey,
      })
      byOccurrence.set(photo.stopOccurrenceId, list)
    }
    return byOccurrence
  }
}

type ReportQueryRow = Omit<OccurrenceChargeReportRecord, 'photos' | 'receivingCharge'> & {
  readonly stopDriverPayoutSentAt: Date | null
  readonly stopDriverPixKey: string | null
  readonly stopDriverPixKeyType: PixKeyType | null
  readonly stopPaidBy: StopOccurrencePaidBy | null
}

function toRecord(
  row: ReportQueryRow,
  photos: readonly OccurrenceChargeReportPhotoLocation[],
): OccurrenceChargeReportRecord {
  const { stopDriverPayoutSentAt, stopDriverPixKey, stopDriverPixKeyType, stopPaidBy, ...charge } =
    row
  return {
    ...charge,
    photos,
    receivingCharge:
      charge.chargeType === RECEIVING_CHARGE_TYPE
        ? {
            driverPayoutSentAt: stopDriverPayoutSentAt?.toISOString() ?? null,
            driverPixKey: stopDriverPixKey,
            driverPixKeyType: stopDriverPixKeyType,
            paidBy: stopPaidBy,
          }
        : null,
  }
}
