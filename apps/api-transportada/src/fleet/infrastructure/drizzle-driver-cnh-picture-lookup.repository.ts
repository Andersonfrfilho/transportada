/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  fleetDriverAttachments,
  fleetDrivers,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import type { DriverCnhPictureLookupPort } from '../application/apply-driver-cnh-picture.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleDriverCnhPictureLookupRepository(
  database: Database,
): DriverCnhPictureLookupPort {
  return {
    async findDriverUser({ attachmentId, companyId }) {
      const [row] = await database
        .select({ userId: userCompanyMemberships.userId })
        .from(fleetDriverAttachments)
        .innerJoin(
          fleetDrivers,
          and(
            eq(fleetDrivers.companyId, fleetDriverAttachments.companyId),
            eq(fleetDrivers.id, fleetDriverAttachments.driverId),
          ),
        )
        .leftJoin(
          userCompanyMemberships,
          and(
            eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
            eq(userCompanyMemberships.id, fleetDrivers.membershipId),
          ),
        )
        .where(
          and(
            eq(fleetDriverAttachments.companyId, companyId),
            eq(fleetDriverAttachments.id, attachmentId),
            eq(fleetDriverAttachments.type, 'cnh'),
          ),
        )
        .limit(1)

      return row === undefined ? undefined : { userId: row.userId ?? undefined }
    },
  }
}
