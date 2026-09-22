/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T3: inserir, contar e listar o anexo da ocorrência de galpão — sempre por `companyId`,
 * em cada junção, nunca só na tabela de cima (`test/trip-schema/tenant-safety.contract.ts`).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { alias } from 'drizzle-orm/pg-core'
import { and, asc, eq, sql } from 'drizzle-orm'

import { storedObjects } from '../../database/storage.schema.js'
import {
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
} from '../../database/trip.schema.js'
import type {
  OccurrenceAttachmentRecord,
  ReadOccurrenceAttachmentsPort,
} from '../application/occurrence-attachment.service.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const originalObjects = alias(storedObjects, 'trip_occurrence_attachment_original')
const thumbnailObjects = alias(storedObjects, 'trip_occurrence_attachment_thumbnail')

export type InsertOccurrenceAttachmentInput = {
  readonly companyId: string
  readonly occurrenceId: string
  readonly storedObjectId: string
  /** Ausente/nulo: sem miniatura (falha de geração, RF29b, ou foto de WhatsApp, D14). */
  readonly thumbnailObjectId?: string | null
}

export type InsertOccurrenceAttachmentResult = {
  readonly id: string
  readonly position: number
}

type InsertOccurrenceAttachmentRow = {
  readonly id: string
  readonly position: number
}

/**
 * ⚠️ `position` **não** vem de um `SELECT count(*)` antes do `INSERT` (plan.md, T1) — o
 * `coalesce(max(position), 0) + 1` mora dentro da própria instrução, fechando a janela em que duas
 * requisições calculariam a mesma posição. O unique de `(company_id, occurrence_id, position)` e o
 * CHECK de `position` (1 a 5) resolvem a corrida da sexta foto por `23505`/`23514` — mapear os dois
 * para `TripOccurrenceAttachmentLimitError` é do caso de uso que chama esta função (T6/T7). Exportada
 * como função solta (e não só método de classe) para rodar **dentro** da transação de quem grava
 * (`persist-separation-occurrence-attachment.service.ts`, T6) — o `queryable` pode ser a conexão ou
 * uma transação aberta, nunca uma segunda conexão.
 */
export async function insertOccurrenceAttachmentRow(
  queryable: TripQueryable,
  input: InsertOccurrenceAttachmentInput,
): Promise<InsertOccurrenceAttachmentResult> {
  const rows = await queryable.execute<InsertOccurrenceAttachmentRow>(sql`
    insert into trip_document_occurrence_attachments
      (company_id, occurrence_id, stored_object_id, thumbnail_object_id, position)
    select
      ${input.companyId}::uuid,
      ${input.occurrenceId}::uuid,
      ${input.storedObjectId}::uuid,
      ${input.thumbnailObjectId ?? null}::uuid,
      coalesce(max(position), 0) + 1
    from trip_document_occurrence_attachments
    where company_id = ${input.companyId}::uuid and occurrence_id = ${input.occurrenceId}::uuid
    returning id, position
  `)
  const row = rows[0]
  if (row === undefined) throw new Error('TRIP_OCCURRENCE_ATTACHMENT_NOT_SAVED')

  return { id: row.id, position: Number(row.position) }
}

export class DrizzleOccurrenceAttachmentRepository implements ReadOccurrenceAttachmentsPort {
  public constructor(private readonly database: Database) {}

  public insertOccurrenceAttachment(
    input: InsertOccurrenceAttachmentInput,
  ): Promise<InsertOccurrenceAttachmentResult> {
    return insertOccurrenceAttachmentRow(this.database, input)
  }

  public async countOccurrenceAttachments(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<number> {
    const [row] = await this.database
      .select({ total: sql<number>`count(*)` })
      .from(tripDocumentOccurrenceAttachments)
      .where(
        and(
          eq(tripDocumentOccurrenceAttachments.companyId, input.companyId),
          eq(tripDocumentOccurrenceAttachments.occurrenceId, input.occurrenceId),
        ),
      )

    return Number(row?.total ?? 0)
  }

  /** `[]` quando a ocorrência não tem nenhuma linha na tabela nova (RF15 cai para a coluna antiga). */
  public async listOccurrenceAttachments(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<readonly OccurrenceAttachmentRecord[]> {
    const rows = await this.database
      .select({
        id: tripDocumentOccurrenceAttachments.id,
        originalBucket: originalObjects.bucket,
        originalMimeType: originalObjects.mimeType,
        originalObjectKey: originalObjects.objectKey,
        originalRetentionUntil: originalObjects.retentionUntil,
        position: tripDocumentOccurrenceAttachments.position,
        thumbnailBucket: thumbnailObjects.bucket,
        thumbnailMimeType: thumbnailObjects.mimeType,
        thumbnailObjectKey: thumbnailObjects.objectKey,
        thumbnailRetentionUntil: thumbnailObjects.retentionUntil,
      })
      .from(tripDocumentOccurrenceAttachments)
      .innerJoin(
        originalObjects,
        and(
          eq(originalObjects.companyId, tripDocumentOccurrenceAttachments.companyId),
          eq(originalObjects.id, tripDocumentOccurrenceAttachments.storedObjectId),
        ),
      )
      .leftJoin(
        thumbnailObjects,
        and(
          eq(thumbnailObjects.companyId, tripDocumentOccurrenceAttachments.companyId),
          eq(thumbnailObjects.id, tripDocumentOccurrenceAttachments.thumbnailObjectId),
        ),
      )
      .where(
        and(
          eq(tripDocumentOccurrenceAttachments.companyId, input.companyId),
          eq(tripDocumentOccurrenceAttachments.occurrenceId, input.occurrenceId),
        ),
      )
      .orderBy(asc(tripDocumentOccurrenceAttachments.position))

    return rows.map((row) => ({
      id: row.id,
      original: {
        bucket: row.originalBucket,
        mimeType: row.originalMimeType,
        objectKey: row.originalObjectKey,
        retentionUntil: row.originalRetentionUntil?.toISOString() ?? null,
      },
      position: row.position,
      thumbnail:
        row.thumbnailBucket === null || row.thumbnailObjectKey === null
          ? null
          : {
              bucket: row.thumbnailBucket,
              mimeType: row.thumbnailMimeType ?? '',
              objectKey: row.thumbnailObjectKey,
              retentionUntil: row.thumbnailRetentionUntil?.toISOString() ?? null,
            },
    }))
  }

  /**
   * D6: a ocorrência de rua (spec 156 T7b) continua servida pela coluna `attachment_object_id` —
   * anterior às miniaturas, então sempre `position: 1` sem `thumbnail`. `null` quando a coluna está
   * vazia (ocorrência sem foto, ou já migrada para a tabela nova).
   */
  public async findLegacyOccurrenceAttachment(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<OccurrenceAttachmentRecord | null> {
    const [row] = await this.database
      .select({
        bucket: storedObjects.bucket,
        mimeType: storedObjects.mimeType,
        objectKey: storedObjects.objectKey,
        occurrenceId: tripDocumentOccurrences.id,
        retentionUntil: storedObjects.retentionUntil,
      })
      .from(tripDocumentOccurrences)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.companyId, tripDocumentOccurrences.companyId),
          eq(storedObjects.id, tripDocumentOccurrences.attachmentObjectId),
        ),
      )
      .where(
        and(
          eq(tripDocumentOccurrences.companyId, input.companyId),
          eq(tripDocumentOccurrences.id, input.occurrenceId),
        ),
      )
      .limit(1)

    if (row === undefined) return null

    return {
      id: row.occurrenceId,
      original: {
        bucket: row.bucket,
        mimeType: row.mimeType,
        objectKey: row.objectKey,
        retentionUntil: row.retentionUntil?.toISOString() ?? null,
      },
      position: 1,
      thumbnail: null,
    }
  }
}
