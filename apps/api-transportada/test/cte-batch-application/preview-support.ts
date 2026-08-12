import { expect } from 'bun:test'

import type { CteEmissionProfileDetail } from '../../src/cte-profiles/application/cte-emission-profile.port.js'
import { ApiError } from '../../src/shared/api.error.js'

export const PREVIEW_COMPANY_ID = 'company-001'
export const PREVIEW_CONTEXT = { companyId: PREVIEW_COMPANY_ID, userId: 'user-001' } as const

/** Relógio fixo do preview: meio-dia UTC de 30/07/2026 é o mesmo dia em São Paulo. */
export const PREVIEW_NOW = new Date('2026-07-30T12:00:00.000Z')
export const PREVIEW_NAME_PREFIX = 'CT-e 2026-07-30 #'

export const PROFILE_ID = '00000000-0000-4000-8000-0000000007a0'
export const SECOND_PROFILE_ID = '00000000-0000-4000-8000-0000000007a2'
export const REFERENCE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000701'
export const SECOND_DOCUMENT_ID = '00000000-0000-4000-8000-000000000702'
export const UNKNOWN_DOCUMENT_ID = '00000000-0000-4000-8000-0000000007ff'
export const LINKED_BATCH_ID = '00000000-0000-4000-8000-0000000007b0'
export const SENDER_TAX_ID = '05868574001090'
export const RECIPIENT_TAX_ID = '19354980000159'

export type PreviewDocumentFixture = {
  readonly accessKey: string
  readonly companyId: string
  readonly grossWeight: string | null
  readonly id: string
  readonly issuedAt: string
  readonly number: string
  readonly recipientCity: string | null
  readonly recipientState: string | null
  readonly recipientTaxId: string | null
  readonly senderCity: string | null
  readonly senderState: string | null
  readonly senderTaxId: string | null
  readonly series: string
  readonly status: string
  readonly totalAmount: string | null
  readonly variant: string
}

export type PreviewBlock = {
  readonly batchId: string | null
  readonly documentId: string
  readonly reason: string
}

export type PreviewChargeComponent = {
  readonly amount: string
  readonly calculationType: string
  readonly label: string
}

export type PreviewProjection = {
  readonly adjustments: readonly { readonly amount: string; readonly type: string }[]
  readonly baseAmount: string
  readonly calculatedAmount: string
  readonly components: readonly PreviewChargeComponent[]
  readonly documents: readonly {
    readonly accessKey: string
    readonly documentId: string
    readonly number: string
    readonly series: string
    readonly totalAmount: string
  }[]
  readonly fiscalAmount: string
  readonly fiscalComponents: readonly PreviewChargeComponent[]
  readonly percentage: string
  readonly profile: {
    readonly groupingMode: string
    readonly id: string
    readonly matchedBy: string
    readonly name: string
    readonly resolvedBy: string
  }
  readonly recipientTaxId: string
  readonly senderTaxId: string
}

export type PreviewResult = {
  readonly blocked: readonly PreviewBlock[]
  readonly projections: readonly PreviewProjection[]
  readonly suggestedName: string
  readonly summary: {
    readonly blockedCount: number
    readonly documentCount: number
    readonly projectedCount: number
    readonly totalAmount: string
  }
}

export const REFERENCE_DOCUMENT: PreviewDocumentFixture = {
  accessKey: '35260705868574001090550020008526741408978623',
  companyId: PREVIEW_COMPANY_ID,
  grossWeight: '101.7320',
  id: REFERENCE_DOCUMENT_ID,
  issuedAt: '2026-07-07T07:08:44.000Z',
  number: '852674',
  recipientCity: 'ITIRAPUA',
  recipientState: 'SP',
  recipientTaxId: RECIPIENT_TAX_ID,
  senderCity: 'TAUBATE',
  senderState: 'SP',
  senderTaxId: SENDER_TAX_ID,
  series: '2',
  status: 'authorized',
  totalAmount: '958.4800',
  variant: 'complete',
}

export const SECOND_DOCUMENT: PreviewDocumentFixture = {
  ...REFERENCE_DOCUMENT,
  accessKey: '35260705868574001090550020008526751408978620',
  id: SECOND_DOCUMENT_ID,
  issuedAt: '2026-07-08T07:08:44.000Z',
  number: '852675',
  totalAmount: '1041.5200',
}

const BASE_PROFILE: CteEmissionProfileDetail = {
  cargoInsuranceDeclared: true,
  cfopInternal: '5353',
  cfopInterstate: '6353',
  chargeComponentLabel: 'Frete',
  companyId: PREVIEW_COMPANY_ID,
  components: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  deliveryDays: '3',
  freightRule: {
    maximumAmount: null,
    minimumAmount: null,
    percentage: '0.045000',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  },
  freightRuleId: '00000000-0000-4000-8000-0000000007a1',
  groupingMode: 'per_invoice',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '00',
  icmsRate: '0.120000',
  id: PROFILE_ID,
  matchMode: 'sender_tax_id',
  matchers: [{ matchRole: 'sender', taxId: SENDER_TAX_ID }],
  modal: '01',
  name: 'Perfil Zaragoza',
  observations: '',
  operationNature: 'Prestacao de servico de transporte',
  pickupDetails: 'Retirar na doca 3',
  pickupIndicator: '0',
  predominantProductMode: 'highest_value',
  predominantProductName: '',
  priority: '1',
  receiverIeIndicator: '1',
  serviceType: '0',
  status: 'active',
  taker: '0',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: '1',
}

export function createProfileFixture(
  overrides: Partial<CteEmissionProfileDetail> = {},
): CteEmissionProfileDetail {
  return { ...BASE_PROFILE, ...overrides }
}

export class CteBatchPreviewReaderFixture {
  public readonly documentQueries: Array<Record<string, unknown>> = []
  public readonly documents: Map<string, PreviewDocumentFixture>
  public readonly linkQueries: Array<Record<string, unknown>> = []
  public readonly links: Map<string, string>
  public readonly nameQueries: Array<Record<string, unknown>> = []
  public readonly nfseLinkQueries: Array<Record<string, unknown>> = []
  public readonly nfseLinks: Map<string, string>
  public batchNames: readonly string[] = []

  public constructor(
    documents: readonly PreviewDocumentFixture[] = [REFERENCE_DOCUMENT, SECOND_DOCUMENT],
    links: Map<string, string> = new Map(),
    nfseLinks: Map<string, string> = new Map(),
  ) {
    this.documents = new Map(documents.map((document) => [document.id, document]))
    this.links = links
    this.nfseLinks = nfseLinks
  }

  public async findBatchNamesStartingWith(
    input: Record<string, unknown>,
  ): Promise<readonly string[]> {
    this.nameQueries.push(input)
    return this.batchNames
  }

  public async findPreviewDocuments(
    input: Record<string, unknown>,
  ): Promise<readonly PreviewDocumentFixture[]> {
    this.documentQueries.push(input)
    return readDocumentIds(input).flatMap((documentId) => {
      const document = this.documents.get(documentId)
      return document === undefined ? [] : [document]
    })
  }

  public async findActiveBatchLinks(
    input: Record<string, unknown>,
  ): Promise<readonly { readonly batchId: string; readonly documentId: string }[]> {
    this.linkQueries.push(input)
    return readDocumentIds(input).flatMap((documentId) => {
      const batchId = this.links.get(documentId)
      return batchId === undefined ? [] : [{ batchId, documentId }]
    })
  }

  public async findActiveNfseLinks(
    input: Record<string, unknown>,
  ): Promise<readonly { readonly documentId: string; readonly invoiceId: string }[]> {
    this.nfseLinkQueries.push(input)
    return readDocumentIds(input).flatMap((documentId) => {
      const invoiceId = this.nfseLinks.get(documentId)
      return invoiceId === undefined ? [] : [{ documentId, invoiceId }]
    })
  }
}

export class CteBatchPreviewProfileCatalogFixture {
  public readonly queries: Array<Record<string, unknown>> = []

  public constructor(private readonly profiles: readonly CteEmissionProfileDetail[]) {}

  public async listProfiles(
    input: Record<string, unknown>,
  ): Promise<readonly CteEmissionProfileDetail[]> {
    this.queries.push(input)
    return this.profiles
  }
}

export async function createPreviewUseCaseForTest(
  options: {
    readonly now?: Date
    readonly profiles?: CteBatchPreviewProfileCatalogFixture
    readonly reader?: CteBatchPreviewReaderFixture
  } = {},
): Promise<{
  readonly execute: (input: Record<string, unknown>) => Promise<PreviewResult>
  readonly profiles: CteBatchPreviewProfileCatalogFixture
  readonly reader: CteBatchPreviewReaderFixture
}> {
  const profiles =
    options.profiles ?? new CteBatchPreviewProfileCatalogFixture([createProfileFixture()])
  const reader = options.reader ?? new CteBatchPreviewReaderFixture()
  let moduleExports: Record<string, unknown>
  try {
    moduleExports = (await import(
      '../../src/cte-batches/application/preview-cte-batch.use-case.js'
    )) as Record<string, unknown>
  } catch (error) {
    throw new Error(`T007 preview implementation is missing: ${String(error)}`)
  }

  const now = options.now ?? PREVIEW_NOW
  const factory = moduleExports['createPreviewCteBatchUseCase']
  expect(typeof factory).toBe('function')
  const useCase = (
    factory as (dependencies: {
      readonly clock: { readonly now: () => Date }
      readonly profiles: CteBatchPreviewProfileCatalogFixture
      readonly reader: CteBatchPreviewReaderFixture
    }) => { readonly execute: (input: Record<string, unknown>) => Promise<PreviewResult> }
  )({ clock: { now: () => now }, profiles, reader })

  return { execute: (input) => useCase.execute(input), profiles, reader }
}

export async function capturePreviewApiError(callback: () => Promise<unknown>): Promise<ApiError> {
  try {
    await callback()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }

  throw new Error('Expected ApiError to be thrown')
}

function readDocumentIds(input: Record<string, unknown>): readonly string[] {
  return (input['documentIds'] as readonly string[] | undefined) ?? []
}
