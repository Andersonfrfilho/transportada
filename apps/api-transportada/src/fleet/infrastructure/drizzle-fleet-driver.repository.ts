/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm'

import { fleetDrivers, userCompanyMemberships } from '../../database/database.schema.js'
import type { FleetDriverStatus } from '../../database/fleet.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  FleetDriver,
  FleetDriverFilters,
  FleetDriverInput,
  FleetDriverPage,
  FleetDriverRepositoryPort,
} from '../application/fleet.port.js'
import {
  FleetDriverMembershipTakenError,
  FleetDriverTaxIdTakenError,
} from '../domain/fleet.error.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import { mapDriver, toDriverColumns } from './fleet.mapper.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_MEMBERSHIP_STATUS = 'active'
const MEMBERSHIP_CONSTRAINT = 'fleet_drivers_company_membership_unique'
const TAX_ID_CONSTRAINT = 'fleet_drivers_company_id_tax_id_unique'

export class DrizzleFleetDriverRepository implements FleetDriverRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly companyId: string
    readonly driver: FleetDriverInput
  }): Promise<FleetDriver> {
    const record = await runGuarded(async () => {
      const [created] = await this.database
        .insert(fleetDrivers)
        .values({ ...toDriverColumns(input.driver), companyId: input.companyId })
        .returning()
      return created
    })
    if (record === undefined) throw new Error('FLEET_DRIVER_CREATE_FAILED')
    return mapDriver(record)
  }

  public async findById(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<FleetDriver | null> {
    const [record] = await this.database
      .select()
      .from(fleetDrivers)
      .where(and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)))
      .limit(1)
    return record === undefined ? null : mapDriver(record)
  }

  /** Um membership desligado não loga no app — vincular motorista a ele nasceria morto. */
  public async hasMembership(input: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<boolean> {
    const [record] = await this.database
      .select({ id: userCompanyMemberships.id })
      .from(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.id, input.membershipId),
          eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
        ),
      )
      .limit(1)
    return record !== undefined
  }

  public async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: FleetDriverFilters
    readonly limit: number
  }): Promise<FleetDriverPage> {
    const cursor = decodeKeysetCursor(input.cursor)
    const records = await this.database
      .select()
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          cursor === null
            ? undefined
            : or(
                lt(fleetDrivers.createdAt, cursor.createdAt),
                and(eq(fleetDrivers.createdAt, cursor.createdAt), lt(fleetDrivers.id, cursor.id)),
              ),
          input.filters?.statusEq === undefined
            ? undefined
            : eq(fleetDrivers.status, input.filters.statusEq),
          input.filters?.nameContains === undefined
            ? undefined
            : ilike(fleetDrivers.name, `%${input.filters.nameContains}%`),
        ),
      )
      .orderBy(desc(fleetDrivers.createdAt), desc(fleetDrivers.id))
      .limit(input.limit + 1)

    const pageRecords = records.slice(0, input.limit)
    const last = pageRecords.at(-1)

    return {
      items: pageRecords.map(mapDriver),
      nextCursor:
        records.length > input.limit && last !== undefined ? encodeKeysetCursor(last) : null,
    }
  }

  public async update(input: {
    readonly companyId: string
    readonly driver: FleetDriverInput
    readonly driverId: string
    readonly expectedVersion: string
    readonly status: FleetDriverStatus
  }): Promise<FleetDriver | null> {
    const record = await runGuarded(async () => {
      const [updated] = await this.database
        .update(fleetDrivers)
        .set({
          ...toDriverColumns(input.driver),
          status: input.status,
          updatedAt: new Date(),
          version: BigInt(input.expectedVersion) + 1n,
        })
        .where(
          and(
            eq(fleetDrivers.companyId, input.companyId),
            eq(fleetDrivers.id, input.driverId),
            eq(fleetDrivers.version, BigInt(input.expectedVersion)),
          ),
        )
        .returning()
      return updated
    })
    return record === undefined ? null : mapDriver(record)
  }
}

async function runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    const constraint = violatedUniqueConstraint(error)
    if (constraint === TAX_ID_CONSTRAINT) throw new FleetDriverTaxIdTakenError()
    if (constraint === MEMBERSHIP_CONSTRAINT) throw new FleetDriverMembershipTakenError()
    throw error
  }
}
