/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AggregateDocument,
  AggregateDocumentRepositoryPort,
  AggregateDocumentStoragePort,
  ReviewAggregateDocumentInput,
  UpsertAggregateDocumentInput,
} from '../../src/fleet/application/aggregate-document.port'

type StoredRow = AggregateDocument & { readonly companyId: string; readonly taxId: string }

export class FakeAggregateDocumentRepository implements AggregateDocumentRepositoryPort {
  public readonly rows: StoredRow[] = []
  public declaredFieldsByTaxId = new Map<
    string,
    {
      licenseCategory: string | null
      licenseNumber: string | null
      name: string | null
      plate: string | null
      renavam: string | null
    }
  >()

  public async findDeclaredFields({
    taxId,
  }: {
    readonly companyId: string
    readonly taxId: string
  }) {
    return (
      this.declaredFieldsByTaxId.get(taxId) ?? {
        licenseCategory: null,
        licenseNumber: null,
        name: null,
        plate: null,
        renavam: null,
      }
    )
  }

  public async findDownloadLocation({
    companyId,
    id,
  }: {
    readonly companyId: string
    readonly id: string
  }) {
    const row = this.rows.find(
      (candidate) => candidate.companyId === companyId && candidate.id === id,
    )
    return row === undefined ? null : { bucket: 'test-bucket', objectKey: `key/${row.id}` }
  }

  public async markAutoApproved({
    companyId,
    id,
  }: {
    readonly companyId: string
    readonly id: string
  }) {
    const row = this.rows.find(
      (candidate) => candidate.companyId === companyId && candidate.id === id,
    )
    if (row === undefined) return
    this.rows[this.rows.indexOf(row)] = { ...row, status: 'approved', updatedAt: new Date() }
  }

  public async listByTaxId({
    companyId,
    taxId,
  }: {
    readonly companyId: string
    readonly taxId: string
  }) {
    return this.rows.filter((row) => row.companyId === companyId && row.taxId === taxId)
  }

  public async listPendingByCompany({ companyId }: { readonly companyId: string }) {
    return this.rows.filter((row) => row.companyId === companyId && row.status === 'pending')
  }

  public async review({ companyId, id, rejectionReason, status }: ReviewAggregateDocumentInput) {
    const row = this.rows.find(
      (candidate) => candidate.companyId === companyId && candidate.id === id,
    )
    if (row === undefined) return null
    const updated: StoredRow = { ...row, rejectionReason, status, updatedAt: new Date() }
    this.rows[this.rows.indexOf(row)] = updated
    return updated
  }

  public async upsert(input: UpsertAggregateDocumentInput) {
    const now = new Date()
    const existingIndex = this.rows.findIndex(
      (row) =>
        row.companyId === input.companyId && row.taxId === input.taxId && row.type === input.type,
    )
    const row: StoredRow = {
      companyId: input.companyId,
      createdAt: existingIndex === -1 ? now : this.rows[existingIndex]!.createdAt,
      id: existingIndex === -1 ? crypto.randomUUID() : this.rows[existingIndex]!.id,
      rejectionReason: '',
      status: 'pending',
      taxId: input.taxId,
      type: input.type,
      updatedAt: now,
    }
    if (existingIndex === -1) this.rows.push(row)
    else this.rows[existingIndex] = row
    return row
  }
}

export class FakeAggregateDocumentStorage implements AggregateDocumentStoragePort {
  public readonly storeCalls: Array<{ readonly key: string }> = []

  public async createSignedDownload(input: { readonly bucket: string; readonly key: string }) {
    return new URL(`https://storage.example.test/${input.bucket}/${input.key}`)
  }

  public async storeObject(input: { readonly key: string }) {
    this.storeCalls.push({ key: input.key })
    return undefined
  }
}
