/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20. Só leitura das linhas do lote e a gravação do ponteiro para o demonstrativo.
 *
 * ⚠️ Nenhuma sentença daqui toca `billing_*`, `cte_*`, `nfse_*` ou `fiscal_sequences` — e o teste de
 * integração prova isso por **contagem lida antes e depois**, não por ausência de erro.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import {
  contractors,
  deliveryCharges,
  deliveryClients,
  extraChargeBatches,
} from '../../database/delivery-client.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../database/trip.schema.js'
import { resolveOccurrenceProductCodes } from '../../trips/domain/occurrence-scope.policy.js'
import type {
  OccurrenceStatementBatchRecord,
  OccurrenceStatementCarrierRecord,
  OccurrenceStatementChargeRow,
  OccurrenceStatementObjectRecord,
  OccurrenceStatementPhotoReference,
  OccurrenceStatementRepositoryPort,
} from '../application/occurrence-statement.port.js'
import { EXTRA_CHARGE_BATCH_STATEMENT_PURPOSE } from '../application/occurrence-statement.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const UNKNOWN_CARRIER_NAME = 'Transportadora'
const STORAGE_OBJECT_STATUS_DELETED = 'deleted'

export function buildOccurrenceStatementObjectKey(input: {
  readonly batchId: string
  readonly companyId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/extra-charge-batches/${input.batchId}/statement/${input.objectId}.pdf`
}

export class DrizzleOccurrenceStatementRepository implements OccurrenceStatementRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async findBatch(input: {
    readonly batchId: string
    readonly companyId: string
  }): Promise<OccurrenceStatementBatchRecord | null> {
    const [row] = await this.database
      .select({
        closedAt: extraChargeBatches.closedAt,
        companyId: extraChargeBatches.companyId,
        contractorName: contractors.displayName,
        id: extraChargeBatches.id,
        periodEnd: extraChargeBatches.periodEnd,
        periodStart: extraChargeBatches.periodStart,
        statementObjectId: extraChargeBatches.statementObjectId,
        totalAmount: extraChargeBatches.totalAmount,
      })
      .from(extraChargeBatches)
      .innerJoin(
        contractors,
        and(
          eq(contractors.companyId, extraChargeBatches.companyId),
          eq(contractors.id, extraChargeBatches.contractorId),
        ),
      )
      .where(
        and(
          eq(extraChargeBatches.companyId, input.companyId),
          eq(extraChargeBatches.id, input.batchId),
        ),
      )
      .limit(1)

    return row ?? null
  }

  public async findCarrier(input: {
    readonly companyId: string
  }): Promise<OccurrenceStatementCarrierRecord> {
    const [row] = await this.database
      .select({
        cnpj: companyFiscalProfiles.cnpj,
        legalName: companyFiscalProfiles.legalName,
      })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)

    /**
     * O perfil fiscal aqui é só papel timbrado. Sem ele o demonstrativo sai assim mesmo — recusar
     * seria trocar um documento comercial por um erro, e este documento não é fiscal (RF30).
     */
    if (row === undefined) return { legalName: UNKNOWN_CARRIER_NAME, taxLine: '' }
    return { legalName: row.legalName, taxLine: `CNPJ ${row.cnpj}` }
  }

  public async findStatementObject(input: {
    readonly companyId: string
    readonly objectId: string
  }): Promise<OccurrenceStatementObjectRecord | null> {
    const [row] = await this.database
      .select({
        bucket: storedObjects.bucket,
        mimeType: storedObjects.mimeType,
        objectKey: storedObjects.objectKey,
      })
      .from(storedObjects)
      .where(
        and(
          eq(storedObjects.companyId, input.companyId),
          eq(storedObjects.id, input.objectId),
          eq(storedObjects.purpose, EXTRA_CHARGE_BATCH_STATEMENT_PURPOSE),
        ),
      )
      .limit(1)

    return row ?? null
  }

  public async listChargeRows(input: {
    readonly batchId: string
    readonly companyId: string
  }): Promise<readonly OccurrenceStatementChargeRow[]> {
    const charges = await this.database
      .select({
        accessKey: nfeDocuments.accessKey,
        amount: deliveryCharges.amount,
        chargeType: deliveryCharges.chargeType,
        chargedOn: deliveryCharges.chargedOn,
        clientName: deliveryClients.displayName,
        id: deliveryCharges.id,
        notes: deliveryCharges.notes,
        noteNumber: nfeDocuments.number,
        noteSeries: nfeDocuments.series,
        occurrenceId: deliveryCharges.occurrenceId,
        occurrenceProductCode: tripDocumentOccurrences.productCode,
      })
      .from(deliveryCharges)
      .innerJoin(
        deliveryClients,
        and(
          eq(deliveryClients.companyId, deliveryCharges.companyId),
          eq(deliveryClients.id, deliveryCharges.deliveryClientId),
        ),
      )
      .leftJoin(tripDocuments, eq(tripDocuments.id, deliveryCharges.tripDocumentId))
      .leftJoin(nfeDocuments, eq(nfeDocuments.id, tripDocuments.nfeDocumentId))
      .leftJoin(
        tripDocumentOccurrences,
        and(
          eq(tripDocumentOccurrences.companyId, deliveryCharges.companyId),
          eq(tripDocumentOccurrences.id, deliveryCharges.occurrenceId),
        ),
      )
      .where(
        and(
          eq(deliveryCharges.companyId, input.companyId),
          eq(deliveryCharges.batchId, input.batchId),
        ),
      )
      .orderBy(asc(deliveryCharges.chargedOn), asc(deliveryCharges.id))

    const occurrenceIds = charges
      .map((charge) => charge.occurrenceId)
      .filter((id): id is string => id !== null)
    const [photos, products] = await Promise.all([
      this.loadPhotos({ companyId: input.companyId, occurrenceIds }),
      this.loadProductCodes({ companyId: input.companyId, occurrenceIds }),
    ])

    return charges.map((charge) => {
      const photo = charge.occurrenceId === null ? undefined : photos.get(charge.occurrenceId)
      const codes = charge.occurrenceId === null ? [] : (products.get(charge.occurrenceId) ?? [])

      return {
        accessKey: charge.accessKey,
        amount: charge.amount,
        chargeType: charge.chargeType,
        chargedOn: charge.chargedOn,
        clientName: charge.clientName,
        id: charge.id,
        noteNumber: charge.noteNumber,
        noteSeries: charge.noteSeries,
        notes: charge.notes,
        photo: photo?.reference ?? null,
        photoCount: photo?.count ?? 0,
        productCodes: resolveOccurrenceProductCodes({
          productCode: charge.occurrenceProductCode ?? '',
          productCodes: codes,
        }),
      }
    })
  }

  public async saveStatement(input: {
    readonly batchId: string
    readonly bucket: string
    readonly companyId: string
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly provider: string
    readonly retentionUntil: Date
    readonly sha256: string
    readonly sizeBytes: bigint
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction.insert(storedObjects).values({
        bucket: input.bucket,
        companyId: input.companyId,
        id: input.objectId,
        mimeType: input.mimeType,
        objectKey: input.objectKey,
        provider: input.provider,
        purpose: EXTRA_CHARGE_BATCH_STATEMENT_PURPOSE,
        retentionUntil: input.retentionUntil,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        status: 'final',
      })

      /**
       * ⚠️ `statement_object_id is null` no `where`: duas gerações simultâneas não se sobrescrevem,
       * e a segunda simplesmente não encontra linha — o artefato é imutável no banco, não na boa fé.
       */
      await transaction
        .update(extraChargeBatches)
        .set({ statementObjectId: input.objectId, updatedAt: new Date() })
        .where(
          and(
            eq(extraChargeBatches.companyId, input.companyId),
            eq(extraChargeBatches.id, input.batchId),
            sql`${extraChargeBatches.statementObjectId} is null`,
          ),
        )
    })
  }

  private async loadPhotos(input: {
    readonly companyId: string
    readonly occurrenceIds: readonly string[]
  }): Promise<
    ReadonlyMap<
      string,
      { readonly count: number; readonly reference: OccurrenceStatementPhotoReference | null }
    >
  > {
    const result = new Map<
      string,
      { readonly count: number; readonly reference: OccurrenceStatementPhotoReference | null }
    >()
    if (input.occurrenceIds.length === 0) return result

    const original = alias(storedObjects, 'statement_original_objects')
    const thumbnail = alias(storedObjects, 'statement_thumbnail_objects')

    const rows = await this.database
      .select({
        occurrenceId: tripDocumentOccurrenceAttachments.occurrenceId,
        originalBucket: original.bucket,
        originalKey: original.objectKey,
        originalMimeType: original.mimeType,
        originalRetentionUntil: original.retentionUntil,
        originalStatus: original.status,
        position: tripDocumentOccurrenceAttachments.position,
        thumbnailBucket: thumbnail.bucket,
        thumbnailKey: thumbnail.objectKey,
        thumbnailMimeType: thumbnail.mimeType,
        thumbnailRetentionUntil: thumbnail.retentionUntil,
        thumbnailStatus: thumbnail.status,
      })
      .from(tripDocumentOccurrenceAttachments)
      .innerJoin(
        original,
        and(
          eq(original.companyId, tripDocumentOccurrenceAttachments.companyId),
          eq(original.id, tripDocumentOccurrenceAttachments.storedObjectId),
        ),
      )
      .leftJoin(
        thumbnail,
        and(
          eq(thumbnail.companyId, tripDocumentOccurrenceAttachments.companyId),
          eq(thumbnail.id, tripDocumentOccurrenceAttachments.thumbnailObjectId),
        ),
      )
      .where(
        and(
          eq(tripDocumentOccurrenceAttachments.companyId, input.companyId),
          inArray(tripDocumentOccurrenceAttachments.occurrenceId, [
            ...new Set(input.occurrenceIds),
          ]),
        ),
      )
      .orderBy(
        asc(tripDocumentOccurrenceAttachments.occurrenceId),
        asc(tripDocumentOccurrenceAttachments.position),
      )

    const now = new Date()
    for (const row of rows) {
      const current = result.get(row.occurrenceId)
      const count = (current?.count ?? 0) + 1
      /** A primeira linha de cada ocorrência é a de menor `position` — o corpo leva essa. */
      const reference =
        current?.reference === undefined || count === 1
          ? toPhotoReference({ now, row })
          : current.reference
      result.set(row.occurrenceId, { count, reference })
    }

    return result
  }

  private async loadProductCodes(input: {
    readonly companyId: string
    readonly occurrenceIds: readonly string[]
  }): Promise<ReadonlyMap<string, readonly string[]>> {
    const result = new Map<string, string[]>()
    if (input.occurrenceIds.length === 0) return result

    const rows = await this.database
      .select({
        occurrenceId: tripDocumentOccurrenceProducts.occurrenceId,
        productCode: tripDocumentOccurrenceProducts.productCode,
      })
      .from(tripDocumentOccurrenceProducts)
      .where(
        and(
          eq(tripDocumentOccurrenceProducts.companyId, input.companyId),
          inArray(tripDocumentOccurrenceProducts.occurrenceId, [...new Set(input.occurrenceIds)]),
        ),
      )
      .orderBy(
        asc(tripDocumentOccurrenceProducts.occurrenceId),
        asc(tripDocumentOccurrenceProducts.position),
      )

    for (const row of rows) {
      const codes = result.get(row.occurrenceId)
      if (codes === undefined) result.set(row.occurrenceId, [row.productCode])
      else codes.push(row.productCode)
    }

    return result
  }
}

type PhotoRow = {
  readonly originalBucket: string
  readonly originalKey: string
  readonly originalMimeType: string
  readonly originalRetentionUntil: Date | null
  readonly originalStatus: string
  readonly thumbnailBucket: string | null
  readonly thumbnailKey: string | null
  readonly thumbnailMimeType: string | null
  readonly thumbnailRetentionUntil: Date | null
  readonly thumbnailStatus: string | null
}

/** Miniatura primeiro: ela é a que existe para ser carregada em lista, e o PDF leva uma por linha. */
function toPhotoReference(input: {
  readonly now: Date
  readonly row: PhotoRow
}): OccurrenceStatementPhotoReference {
  const { now, row } = input
  if (row.thumbnailKey !== null && row.thumbnailBucket !== null) {
    return {
      bucket: row.thumbnailBucket,
      expired: isExpired({
        now,
        retentionUntil: row.thumbnailRetentionUntil,
        status: row.thumbnailStatus,
      }),
      mimeType: row.thumbnailMimeType ?? '',
      objectKey: row.thumbnailKey,
    }
  }

  return {
    bucket: row.originalBucket,
    expired: isExpired({
      now,
      retentionUntil: row.originalRetentionUntil,
      status: row.originalStatus,
    }),
    mimeType: row.originalMimeType,
    objectKey: row.originalKey,
  }
}

/** O expurgo da spec 161 é cego à cobrança: o anexo pode já ter ido, e isso é um selo, não um erro. */
function isExpired(input: {
  readonly now: Date
  readonly retentionUntil: Date | null
  readonly status: string | null
}): boolean {
  if (input.status === STORAGE_OBJECT_STATUS_DELETED) return true
  return input.retentionUntil !== null && input.retentionUntil.getTime() <= input.now.getTime()
}
