/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.1 (RF1d), contra Postgres real: prende a leitura que já existe desde a 161 T10 para a
 * ocorrência de **rua** — as linhas de `trip_document_occurrence_attachments` quando existem, senão a
 * coluna antiga `attachment_object_id` como foto única. As duas fontes nunca se somam. É o que deixa
 * o backfill (T1d.2) e a escrita dupla (T1d.5) invisíveis para quem lê: a mesma foto, uma vez só.
 *
 * ⚠️ O que muda de propósito quando a linha passa a existir: o **id** do anexo deixa de ser o id da
 * ocorrência e passa a ser o id da linha, no feed, no painel e na linha do tempo da ocorrência.
 */
import { describe, expect } from 'bun:test'

import { readOccurrenceAttachments } from '../../src/trips/application/occurrence-attachment.service.js'
import { DrizzleOccurrenceAttachmentRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import { listTripOccurrenceAttachmentLocations } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
import { listDocumentOccurrenceRows } from '../../src/trips/infrastructure/trip-timeline-document.query.js'
import {
  seedAttachmentRow,
  seedDocumentOccurrence,
  seedPhotoObject,
  STREET_PHOTO_PURPOSE,
} from '../fixtures/street-occurrence-attachment.fixture.js'
import {
  seedCompany,
  seedDeliveryOccurrenceType,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const OCCURRED_AT = new Date('2026-09-20T10:00:00.000Z')
const ROW_CREATED_AT = new Date('2026-09-20T10:05:00.000Z')

const DOWNLOADS = {
  async createDownloadUrl(input: { readonly bucket: string; readonly objectKey: string }) {
    return { expiresAt: '2026-09-21T12:05:00.000Z', url: `https://bucket.test/${input.objectKey}` }
  },
}

/** As quatro leituras da foto de uma ocorrência de nota, como cada tela a pede. */
async function readFourWays(
  database: TestDatabase,
  input: { readonly companyId: string; readonly occurrenceId: string; readonly tripId: string },
) {
  const scope = { companyId: input.companyId, occurrenceId: input.occurrenceId }
  const feed = await listTripOccurrenceAttachmentLocations(database.db, scope)
  const panel = await readOccurrenceAttachments({
    ...scope,
    downloads: DOWNLOADS,
    repository: new DrizzleOccurrenceAttachmentRepository(database.db),
  })
  const tripTimeline = await listDocumentOccurrenceRows(database.db, {
    companyId: input.companyId,
    cursor: null,
    limit: 20,
    tripId: input.tripId,
  })
  const occurrenceTimeline = await findTripOccurrenceTimelineSources(database.db, scope)
  return {
    feed,
    panel,
    photoEvents: (occurrenceTimeline ?? []).filter((source) => source.kind === 'occurrence.photo'),
    tripTimelineCount: tripTimeline.find((row) => row.id === input.occurrenceId)?.occurrence
      ?.attachmentCount,
  }
}

describe('a foto da ocorrência de rua: linha nova, senão a coluna antiga (spec 246 T1d.1)', () => {
  testWithPostgres('só a coluna: uma foto, com o id e a hora da ocorrência', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const typeId = await seedDeliveryOccurrenceType(database, company)
      const objectId = await seedPhotoObject(database, { company, purpose: STREET_PHOTO_PURPOSE })
      const occurrenceId = await seedDocumentOccurrence(database, {
        attachmentObjectId: objectId,
        company,
        createdAt: OCCURRED_AT,
        stage: 'delivery',
        trip,
        typeId,
      })

      const read = await readFourWays(database, {
        companyId: company.companyId,
        occurrenceId,
        tripId: trip.tripId,
      })

      expect(read.feed.map((record) => [record.id, record.position])).toEqual([[occurrenceId, 1]])
      expect(read.feed[0]?.thumbnail).toBeNull()
      expect(read.panel.map((view) => view.id)).toEqual([occurrenceId])
      expect(read.tripTimelineCount).toBe(1)
      expect(read.photoEvents.map((event) => [event.id, event.occurredAt])).toEqual([
        [occurrenceId, OCCURRED_AT.toISOString()],
      ])
    })
  })

  testWithPostgres(
    'coluna e linha: só a linha, uma vez — o id e a hora passam a ser os da linha',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const typeId = await seedDeliveryOccurrenceType(database, company)
        const objectId = await seedPhotoObject(database, { company, purpose: STREET_PHOTO_PURPOSE })
        const occurrenceId = await seedDocumentOccurrence(database, {
          attachmentObjectId: objectId,
          company,
          createdAt: OCCURRED_AT,
          stage: 'delivery',
          trip,
          typeId,
        })
        const rowId = await seedAttachmentRow(database, {
          company,
          createdAt: ROW_CREATED_AT,
          occurrenceId,
          position: 1,
          storedObjectId: objectId,
        })

        const read = await readFourWays(database, {
          companyId: company.companyId,
          occurrenceId,
          tripId: trip.tripId,
        })

        expect(read.feed.map((record) => [record.id, record.position])).toEqual([[rowId, 1]])
        expect(read.panel.map((view) => view.id)).toEqual([rowId])
        expect(read.tripTimelineCount).toBe(1)
        expect(read.photoEvents.map((event) => [event.id, event.occurredAt])).toEqual([
          [rowId, ROW_CREATED_AT.toISOString()],
        ])
      })
    },
  )

  testWithPostgres('sem coluna e sem linha: nenhuma foto em nenhuma leitura', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const typeId = await seedDeliveryOccurrenceType(database, company)
      const occurrenceId = await seedDocumentOccurrence(database, {
        attachmentObjectId: null,
        company,
        createdAt: OCCURRED_AT,
        stage: 'delivery',
        trip,
        typeId,
      })

      const read = await readFourWays(database, {
        companyId: company.companyId,
        occurrenceId,
        tripId: trip.tripId,
      })

      expect(read.feed).toHaveLength(0)
      expect(read.panel).toHaveLength(0)
      expect(read.tripTimelineCount).toBe(0)
      expect(read.photoEvents).toHaveLength(0)
    })
  })
})
