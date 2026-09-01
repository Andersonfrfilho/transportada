/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AggregatePortalAccount,
  AggregatePortalApplication,
  AggregatePortalDriverProfile,
  AggregatePortalRepositoryPort,
} from '../../src/fleet/application/aggregate-portal.port'

export class FakeAggregatePortalRepository implements AggregatePortalRepositoryPort {
  public accountsByUserId = new Map<string, AggregatePortalAccount>()
  public applicationsByTaxId = new Map<string, AggregatePortalApplication>()
  public driversByTaxId = new Map<string, AggregatePortalDriverProfile>()

  public async findAccountByUserId({ userId }: { readonly userId: string }) {
    return this.accountsByUserId.get(userId) ?? null
  }

  public async findApplication({ taxId }: { readonly taxId: string }) {
    return this.applicationsByTaxId.get(taxId) ?? null
  }

  public async findDriverProfile({ taxId }: { readonly taxId: string }) {
    return this.driversByTaxId.get(taxId) ?? null
  }
}
