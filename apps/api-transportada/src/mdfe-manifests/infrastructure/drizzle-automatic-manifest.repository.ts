/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { trips, type TripStatus } from '../../database/trip.schema.js'
import {
  readTripFiscalReadiness,
  type TripFiscalReadinessPort,
  type TripFiscalReadinessSnapshot,
} from '../../trips/application/read-trip-fiscal-readiness.use-case.js'
import type { AutomaticManifestTripPort } from '../application/issue-trip-manifest-automatically.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleAutomaticManifestRepository implements AutomaticManifestTripPort {
  public constructor(
    private readonly dependencies: {
      readonly database: Database
      readonly readiness: TripFiscalReadinessPort
    },
  ) {}

  public async findStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null> {
    const [trip] = await this.dependencies.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)

    return trip?.status ?? null
  }

  /**
   * ADR-0046 §3: a opção é da empresa e nasce desligada. Empresa sem perfil fiscal não tem emissão
   * automática — e não é caso de erro: ela ainda não terminou o cadastro.
   */
  public async isAutomaticEnabled(input: { readonly companyId: string }): Promise<boolean> {
    const [profile] = await this.dependencies.database
      .select({ enabled: companyFiscalProfiles.automaticMdfeOnCompletion })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)

    return profile?.enabled ?? false
  }

  public readReadiness(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripFiscalReadinessSnapshot> {
    return readTripFiscalReadiness({ ...input, repository: this.dependencies.readiness })
  }
}
