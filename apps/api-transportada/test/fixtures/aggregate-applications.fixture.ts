/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AggregateApplication,
  AggregateApplicationRepositoryPort,
  AggregateApplicationSubmissionInput,
} from '../../src/fleet/application/aggregate-applications.port'

export class FakeAggregateApplicationRepository implements AggregateApplicationRepositoryPort {
  public readonly createDriverCalls: Array<{ readonly id: string }> = []
  public readonly driverIdByTaxId = new Map<string, string>()
  public readonly rows: AggregateApplication[] = []

  public async findById({ id }: { readonly id: string }) {
    return this.rows.find((row) => row.id === id) ?? null
  }

  public async findDriverIdByTaxIdInCompanies({ taxId }: { readonly taxId: string }) {
    return this.driverIdByTaxId.get(taxId) ?? null
  }

  public async findPendingByCompanyAndTaxId({
    companyId,
    taxId,
  }: {
    readonly companyId: string
    readonly taxId: string
  }) {
    return (
      this.rows.find(
        (row) => row.companyId === companyId && row.taxId === taxId && row.status === 'pending',
      ) ?? null
    )
  }

  public async insert(
    input: AggregateApplicationSubmissionInput & { readonly duplicateDriverId: string | null },
  ) {
    const row: AggregateApplication = {
      companyId: input.companyId,
      createdAt: new Date(),
      declaredData: input.declaredData,
      driverId: null,
      duplicateDriverId: input.duplicateDriverId,
      email: input.email,
      id: crypto.randomUUID(),
      latestSubmission: null,
      name: input.name,
      phone: input.phone,
      rejectionReason: '',
      resubmittedAt: null,
      reviewedAt: null,
      status: 'pending',
      taxId: input.taxId,
      updatedAt: new Date(),
    }
    this.rows.push(row)
    return row
  }

  public async listByCompany({ companyId }: { readonly companyId: string }) {
    return this.rows.filter((row) => row.companyId === companyId)
  }

  public async updateResubmission(input: {
    readonly declaredData: Record<string, unknown>
    readonly duplicateDriverId: string | null
    readonly email: string
    readonly id: string
    readonly name: string
    readonly phone: string
  }) {
    const row = this.mustFind(input.id)
    const updated: AggregateApplication = {
      ...row,
      declaredData: input.declaredData,
      duplicateDriverId: input.duplicateDriverId,
      email: input.email,
      latestSubmission: {
        declaredData: input.declaredData,
        email: input.email,
        name: input.name,
        phone: input.phone,
      },
      name: input.name,
      phone: input.phone,
      resubmittedAt: new Date(),
      updatedAt: new Date(),
    }
    this.replace(updated)
    return updated
  }

  public async approve({ driverId, id }: { readonly driverId: string; readonly id: string }) {
    const row = this.mustFind(id)
    const updated: AggregateApplication = {
      ...row,
      driverId,
      reviewedAt: new Date(),
      status: 'approved',
      updatedAt: new Date(),
    }
    this.replace(updated)
    return updated
  }

  public async createDriverAndApprove({ id }: { readonly id: string }) {
    this.createDriverCalls.push({ id })
    const row = this.mustFind(id)
    const updated: AggregateApplication = {
      ...row,
      driverId: crypto.randomUUID(),
      reviewedAt: new Date(),
      status: 'approved',
      updatedAt: new Date(),
    }
    this.replace(updated)
    return updated
  }

  public async reject({
    id,
    rejectionReason,
  }: {
    readonly id: string
    readonly rejectionReason: string
  }) {
    const row = this.mustFind(id)
    const updated: AggregateApplication = {
      ...row,
      rejectionReason,
      reviewedAt: new Date(),
      status: 'rejected',
      updatedAt: new Date(),
    }
    this.replace(updated)
    return updated
  }

  private mustFind(id: string): AggregateApplication {
    const row = this.rows.find((candidate) => candidate.id === id)
    if (row === undefined) throw new Error(`aggregate application ${id} not found in fixture`)
    return row
  }

  private replace(updated: AggregateApplication): void {
    const index = this.rows.findIndex((row) => row.id === updated.id)
    this.rows[index] = updated
  }
}
