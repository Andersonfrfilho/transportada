/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF10-RF12: só leitura. Uma consulta de canhotos para todas as notas do relatório.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { companyLogos } from '../../database/company-logo.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import { tripDeliveryProofs, tripStopEvents } from '../../database/trip.schema.js'
import type { TripProofRecord, TripProofReportPort } from '../application/trip-proof-report.port.js'
import { TRIP_PROOF_REPORT_TEXT } from '../domain/trip-proof-report.constant.js'
import type { TripProofLetterhead } from '../domain/trip-proof-report.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const PHOTO_PROOF_KIND = 'photo'

export class DrizzleTripProofReportRepository implements TripProofReportPort {
  public constructor(private readonly database: Database) {}

  public async findExporterName(input: { readonly userId: string }): Promise<string | undefined> {
    const [row] = await this.database
      .select({ name: identityUserProfiles.name })
      .from(identityUserProfiles)
      .where(eq(identityUserProfiles.userId, input.userId))
      .limit(1)
    return row?.name
  }

  public async findLetterhead(input: { readonly companyId: string }): Promise<TripProofLetterhead> {
    const [profile] = await this.database
      .select({ cnpj: companyFiscalProfiles.cnpj, legalName: companyFiscalProfiles.legalName })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)
    const [logo] = await this.database
      .select({ contentBase64: companyLogos.contentBase64 })
      .from(companyLogos)
      .where(eq(companyLogos.companyId, input.companyId))
      .limit(1)

    return {
      legalName: profile?.legalName ?? TRIP_PROOF_REPORT_TEXT.unknownCarrier,
      logoBytes: logo === undefined ? undefined : Buffer.from(logo.contentBase64, 'base64'),
      taxLine: profile === undefined ? '' : `CNPJ ${profile.cnpj}`,
    }
  }

  public async listPhotoProofs(input: {
    readonly companyId: string
    readonly tripDocumentIds: readonly string[]
  }): Promise<readonly TripProofRecord[]> {
    if (input.tripDocumentIds.length === 0) return []

    const rows = await this.database
      .select({
        bucket: storedObjects.bucket,
        mimeType: storedObjects.mimeType,
        objectKey: storedObjects.objectKey,
        tripDocumentId: tripStopEvents.tripDocumentId,
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
        storedObjects,
        and(
          eq(storedObjects.companyId, tripDeliveryProofs.companyId),
          eq(storedObjects.id, tripDeliveryProofs.objectId),
        ),
      )
      .where(
        and(
          eq(tripDeliveryProofs.companyId, input.companyId),
          eq(tripDeliveryProofs.kind, PHOTO_PROOF_KIND),
          inArray(tripStopEvents.tripDocumentId, [...input.tripDocumentIds]),
        ),
      )
      .orderBy(asc(tripDeliveryProofs.createdAt), asc(tripDeliveryProofs.id))
    return rows.flatMap(({ tripDocumentId, ...record }) =>
      tripDocumentId === null ? [] : [{ ...record, tripDocumentId }],
    )
  }
}
