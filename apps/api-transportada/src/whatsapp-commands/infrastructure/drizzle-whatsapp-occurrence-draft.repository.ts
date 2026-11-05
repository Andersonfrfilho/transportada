/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { whatsappOccurrenceDrafts } from '../../database/whatsapp-occurrence-draft.schema.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type {
  WhatsAppOccurrenceDraft,
  WhatsAppOccurrenceDraftRepositoryPort,
} from '../application/whatsapp-occurrence-draft.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const OPEN_UNIQUE = 'whatsapp_occurrence_drafts_company_driver_open_unique'

const COLUMNS = {
  awaiting: whatsappOccurrenceDrafts.awaiting,
  companyId: whatsappOccurrenceDrafts.companyId,
  declaredAmount: whatsappOccurrenceDrafts.declaredAmount,
  documentId: whatsappOccurrenceDrafts.documentId,
  documentNumber: whatsappOccurrenceDrafts.documentNumber,
  driverId: whatsappOccurrenceDrafts.driverId,
  id: whatsappOccurrenceDrafts.id,
  latitude: whatsappOccurrenceDrafts.latitude,
  locationCapturedAt: whatsappOccurrenceDrafts.locationCapturedAt,
  longitude: whatsappOccurrenceDrafts.longitude,
  note: whatsappOccurrenceDrafts.note,
  occurrenceTypeId: whatsappOccurrenceDrafts.occurrenceTypeId,
  originChannel: whatsappOccurrenceDrafts.originChannel,
  photos: whatsappOccurrenceDrafts.photos,
  referenceNumber: whatsappOccurrenceDrafts.referenceNumber,
  skipped: whatsappOccurrenceDrafts.skipped,
  version: whatsappOccurrenceDrafts.version,
}

type Row = Omit<WhatsAppOccurrenceDraft, 'location'> & {
  latitude: null | string
  locationCapturedAt: Date | null
  longitude: null | string
}

/** Spec 293 T15: a ocorrência em coleta, sempre por empresa; uma aberta por motorista. */
export function createDrizzleWhatsAppOccurrenceDraftRepository(
  database: Database,
): WhatsAppOccurrenceDraftRepositoryPort {
  const open = (companyId: string) =>
    and(
      eq(whatsappOccurrenceDrafts.companyId, companyId),
      eq(whatsappOccurrenceDrafts.status, 'open'),
    )
  const sameVersion = (input: { companyId: string; id: string; version: bigint }) =>
    and(
      open(input.companyId),
      eq(whatsappOccurrenceDrafts.id, input.id),
      eq(whatsappOccurrenceDrafts.version, input.version),
    )

  return {
    async close(input) {
      const rows = await database
        .update(whatsappOccurrenceDrafts)
        .set({
          awaiting: null,
          closedAt: sql`now()`,
          status: input.status,
          updatedAt: sql`now()`,
          version: sql`${whatsappOccurrenceDrafts.version} + 1`,
        })
        .where(sameVersion(input))
        .returning({ id: whatsappOccurrenceDrafts.id })
      return rows.length === 1
    },

    async findOpenForDriver(input) {
      const [row] = await database
        .select(COLUMNS)
        .from(whatsappOccurrenceDrafts)
        .where(and(open(input.companyId), eq(whatsappOccurrenceDrafts.driverId, input.driverId)))
        .limit(1)
      return row === undefined ? null : toDraft(row)
    },

    async open(input) {
      try {
        const [row] = await database
          .insert(whatsappOccurrenceDrafts)
          .values({
            companyId: input.companyId,
            documentId: input.documentId,
            documentNumber: input.documentNumber,
            driverId: input.driverId,
            note: input.note,
            occurrenceTypeId: input.occurrenceTypeId,
            originChannel: input.originChannel,
            ...locationColumns(input.location),
          })
          .returning(COLUMNS)
        if (row === undefined) throw new Error('whatsapp occurrence draft insert returned nothing')
        return toDraft(row)
      } catch (error) {
        if (violatedUniqueConstraint(error) === OPEN_UNIQUE) return null
        throw error
      }
    },

    async save(input) {
      const { changes } = input
      const rows = await database
        .update(whatsappOccurrenceDrafts)
        .set({
          awaiting: changes.awaiting,
          declaredAmount: changes.declaredAmount,
          photos: [...changes.photos],
          referenceNumber: changes.referenceNumber,
          skipped: [...changes.skipped],
          updatedAt: sql`now()`,
          version: sql`${whatsappOccurrenceDrafts.version} + 1`,
          ...locationColumns(changes.location),
        })
        .where(sameVersion(input))
        .returning({ id: whatsappOccurrenceDrafts.id })
      return rows.length === 1
    },
  }
}

function locationColumns(location: null | ReportedLocation) {
  return {
    latitude: location?.latitude ?? null,
    locationCapturedAt: location === null ? null : new Date(location.capturedAt),
    longitude: location?.longitude ?? null,
  }
}

function toDraft(row: Row): WhatsAppOccurrenceDraft {
  const { latitude, locationCapturedAt, longitude, version, ...rest } = row
  return {
    ...rest,
    // O cliente da aplicação (`prepare: false`) devolve `bigint` como texto: a versão volta a ser número.
    version: BigInt(version),
    location:
      latitude === null || longitude === null
        ? null
        : {
            accuracyMeters: null,
            capturedAt: (locationCapturedAt ?? new Date()).toISOString(),
            latitude,
            longitude,
          },
  }
}
