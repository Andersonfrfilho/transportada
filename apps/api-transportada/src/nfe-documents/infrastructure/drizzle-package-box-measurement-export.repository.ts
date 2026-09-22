/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, gte, inArray, lt, lte, or, type SQL } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { nfePackageBoxes, nfePackageBoxMeasurements } from '../../database/nfe.schema.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../domain/active-membership-status.constant.js'
import { PACKAGE_BOX_MEASURED_SOURCES } from '../domain/package-box-measurement.constant.js'
import type {
  PackageBoxMeasurementActor,
  PackageBoxMeasurementExportEntry,
  PackageBoxMeasurementExportPage,
  PackageBoxMeasurementExportRepositoryPort,
} from '../application/package-box-measurement-export.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type MeasurementRow = {
  readonly cartonGtin: string | null
  readonly createdAt: Date
  readonly engine: string | null
  readonly heightMarginMm: number | null
  readonly heightMm: number
  readonly id: string
  readonly impreciseConfirmed: boolean
  readonly lengthMarginMm: number | null
  readonly lengthMm: number
  readonly measuredByName: string | null
  readonly measuredByUserId: string
  readonly packageBoxId: string
  readonly productCode: string
  readonly proposedHeightMm: number | null
  readonly proposedLengthMm: number | null
  readonly proposedWidthMm: number | null
  readonly source: PackageBoxMeasurementExportEntry['source']
  readonly warnings: readonly string[]
  readonly widthMarginMm: number | null
  readonly widthMm: number
}

/**
 * Spec 152 (T5, D16, experimental): quem mediu, resolvido pela membership da mesma empresa —
 * `measured_by_user_id` não tem FK (T2), então o ator pode não ter mais vínculo ativo. Só a coluna
 * `id`/`name` sai; nunca id cru sem nome (D16, mesmo cuidado de `nfe-document-event.port.ts`).
 */
export class DrizzlePackageBoxMeasurementExportRepository
  implements PackageBoxMeasurementExportRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public async listMeasurements(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly from: string | undefined
    readonly limit: number
    readonly to: string | undefined
  }): Promise<PackageBoxMeasurementExportPage> {
    const cursor = decodeKeysetCursor(input.cursor)
    const conditions: SQL[] = [
      eq(nfePackageBoxMeasurements.companyId, input.companyId),
      /**
       * Spec 155 (D6), T14 (revisão final, ALTO-1): `replicated` nunca é leitura da câmera — a
       * caixa não foi medida, a dimensão veio de uma irmã da família. Exportá-la inflava as duas
       * taxas do resumo sem uma fita métrica ter encostado nela.
       */
      inArray(nfePackageBoxMeasurements.source, [...PACKAGE_BOX_MEASURED_SOURCES]),
    ]
    if (cursor !== null) conditions.push(buildCursorCondition(cursor))
    if (input.from !== undefined) {
      conditions.push(gte(nfePackageBoxMeasurements.createdAt, new Date(input.from)))
    }
    if (input.to !== undefined) {
      conditions.push(lte(nfePackageBoxMeasurements.createdAt, new Date(input.to)))
    }

    const rows = await this.database
      .select({
        cartonGtin: nfePackageBoxes.cartonGtin,
        createdAt: nfePackageBoxMeasurements.createdAt,
        engine: nfePackageBoxMeasurements.engine,
        heightMarginMm: nfePackageBoxMeasurements.heightMarginMm,
        heightMm: nfePackageBoxMeasurements.heightMm,
        id: nfePackageBoxMeasurements.id,
        impreciseConfirmed: nfePackageBoxMeasurements.impreciseConfirmed,
        lengthMarginMm: nfePackageBoxMeasurements.lengthMarginMm,
        lengthMm: nfePackageBoxMeasurements.lengthMm,
        measuredByName: identityUserProfiles.name,
        measuredByUserId: nfePackageBoxMeasurements.measuredByUserId,
        packageBoxId: nfePackageBoxMeasurements.packageBoxId,
        productCode: nfePackageBoxes.productCode,
        proposedHeightMm: nfePackageBoxMeasurements.proposedHeightMm,
        proposedLengthMm: nfePackageBoxMeasurements.proposedLengthMm,
        proposedWidthMm: nfePackageBoxMeasurements.proposedWidthMm,
        source: nfePackageBoxMeasurements.source,
        warnings: nfePackageBoxMeasurements.warnings,
        widthMarginMm: nfePackageBoxMeasurements.widthMarginMm,
        widthMm: nfePackageBoxMeasurements.widthMm,
      })
      .from(nfePackageBoxMeasurements)
      .innerJoin(
        nfePackageBoxes,
        and(
          eq(nfePackageBoxes.companyId, nfePackageBoxMeasurements.companyId),
          eq(nfePackageBoxes.id, nfePackageBoxMeasurements.packageBoxId),
        ),
      )
      .leftJoin(
        userCompanyMemberships,
        and(
          eq(userCompanyMemberships.userId, nfePackageBoxMeasurements.measuredByUserId),
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
        ),
      )
      .leftJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, userCompanyMemberships.userId),
      )
      .where(and(...conditions))
      .orderBy(desc(nfePackageBoxMeasurements.createdAt), desc(nfePackageBoxMeasurements.id))
      .limit(input.limit + 1)

    const page = rows.slice(0, input.limit)
    const last = page.at(-1)
    return {
      items: page.map(toEntry),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    }
  }
}

function buildCursorCondition(cursor: { readonly createdAt: Date; readonly id: string }): SQL {
  return or(
    lt(nfePackageBoxMeasurements.createdAt, cursor.createdAt),
    and(
      eq(nfePackageBoxMeasurements.createdAt, cursor.createdAt),
      lt(nfePackageBoxMeasurements.id, cursor.id),
    ),
  ) as SQL
}

function toEntry(row: MeasurementRow): PackageBoxMeasurementExportEntry {
  return {
    cartonGtin: row.cartonGtin,
    createdAt: row.createdAt.toISOString(),
    engine: row.engine,
    heightMarginMm: row.heightMarginMm,
    heightMm: row.heightMm,
    id: row.id,
    impreciseConfirmed: row.impreciseConfirmed,
    lengthMarginMm: row.lengthMarginMm,
    lengthMm: row.lengthMm,
    measuredBy: buildActor(row.measuredByUserId, row.measuredByName),
    packageBoxId: row.packageBoxId,
    productCode: row.productCode,
    proposedHeightMm: row.proposedHeightMm,
    proposedLengthMm: row.proposedLengthMm,
    proposedWidthMm: row.proposedWidthMm,
    source: row.source,
    warnings: row.warnings as PackageBoxMeasurementExportEntry['warnings'],
    widthMarginMm: row.widthMarginMm,
    widthMm: row.widthMm,
  }
}

/** `measured_by_user_id` é `not null` — só `{ id, name }` ou `{ removed: true }`, nunca `null`. */
function buildActor(userId: string, name: string | null): PackageBoxMeasurementActor {
  if (name === null) return { removed: true }
  return { id: userId, name }
}
