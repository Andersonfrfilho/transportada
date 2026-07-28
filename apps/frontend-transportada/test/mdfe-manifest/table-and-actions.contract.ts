/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH,
  CTE_BATCH_AUTHORIZED_ITEM,
  CTE_BATCH_CANCELLED_ITEM,
  CTE_BATCH_ID,
  CTE_BATCH_REJECTED_ITEM,
  CTE_FISCAL_DOCUMENT_ID,
  CTE_ISSUED_ACCESS_KEY,
  CTE_SECOND_DOCUMENT_ID,
} from '../cte-batch/cte-batch.fixture'
import {
  AUTHORIZED_MANIFEST_SUMMARY,
  loadFutureModule,
  MANIFEST_PREVIEW,
  MANIFEST_SUMMARY,
  type MdfeManifestSummaryContract,
} from './mdfe-manifest.fixture'

const TABLE_MODULE = '../../src/modules/mdfe-manifest/shared/mdfeManifestTable.service'
const ADVANCED_MODULE = '../../src/modules/mdfe-manifest/shared/mdfeManifestAdvancedFilter.service'
const ACTIONS_MODULE = '../../src/modules/mdfe-manifest/shared/mdfeManifestActions.service'
const CTE_SOURCE_MODULE = '../../src/modules/mdfe-manifest/shared/mdfeManifestCteSource.service'
const FORM_MODULE = '../../src/modules/mdfe-manifest/shared/mdfeManifestForm.service'

const MANIFESTS: readonly MdfeManifestSummaryContract[] = [
  MANIFEST_SUMMARY,
  AUTHORIZED_MANIFEST_SUMMARY,
]

const STATUS_CONDITION = {
  field: 'status',
  id: 'condition-status',
  operator: 'eq',
  value: 'authorized',
  valueTo: '',
} as const

const CTE_COUNT_CONDITION = {
  field: 'cteCount',
  id: 'condition-cte-count',
  operator: 'gte',
  value: '2',
  valueTo: '',
} as const

const NEUTRAL_CONDITION = {
  field: 'fiscalNumber',
  id: 'condition-neutral',
  operator: 'contains',
  value: '',
  valueTo: '',
} as const

describe('mdfe manifest table contract', () => {
  test('cycles header sorting asc, desc and neutral', async () => {
    const table = await loadFutureModule<TableModule>(TABLE_MODULE)

    const ascending = table.nextSortState(null, 'cteCount')
    const descending = table.nextSortState(ascending, 'cteCount')
    expect(ascending).toEqual({ column: 'cteCount', direction: 'asc' })
    expect(descending).toEqual({ column: 'cteCount', direction: 'desc' })
    expect(table.nextSortState(descending, 'cteCount')).toBeNull()
    expect(table.nextSortState(descending, 'createdAt')).toEqual({
      column: 'createdAt',
      direction: 'asc',
    })

    expect(table.sortManifests(MANIFESTS, ascending).map((manifest) => manifest.id)).toEqual([
      AUTHORIZED_MANIFEST_SUMMARY.id,
      MANIFEST_SUMMARY.id,
    ])
    expect(table.sortManifests(MANIFESTS, descending).map((manifest) => manifest.id)).toEqual([
      MANIFEST_SUMMARY.id,
      AUTHORIZED_MANIFEST_SUMMARY.id,
    ])
    expect(table.sortManifests(MANIFESTS, null)).toEqual(MANIFESTS)
  })

  test('filters by multi-value status, text and numeric ranges and counts what is active', async () => {
    const table = await loadFutureModule<TableModule>(TABLE_MODULE)
    const empty = table.EMPTY_MDFE_MANIFEST_FILTERS

    expect(table.countActiveFilters(empty)).toBe(0)
    expect(MANIFESTS.every((manifest) => table.manifestMatchesFilters(manifest, empty))).toBeTrue()

    const byStatus = { ...empty, statuses: ['authorized'] as const }
    expect(table.countActiveFilters(byStatus)).toBe(1)
    expect(
      MANIFESTS.filter((manifest) => table.manifestMatchesFilters(manifest, byStatus)),
    ).toEqual([AUTHORIZED_MANIFEST_SUMMARY])

    const twoStatuses = table.toggleStatusFilter(byStatus.statuses, 'draft')
    expect(twoStatuses).toEqual(['authorized', 'draft'])
    expect(table.toggleStatusFilter(twoStatuses, 'authorized')).toEqual(['draft'])

    const byRange = { ...empty, cteCountFrom: '2', fiscalNumberContains: '' }
    expect(table.countActiveFilters(byRange)).toBe(1)
    expect(table.manifestMatchesFilters(MANIFEST_SUMMARY, byRange)).toBeTrue()
    expect(table.manifestMatchesFilters(AUTHORIZED_MANIFEST_SUMMARY, byRange)).toBeFalse()

    const byFiscalNumber = { ...empty, fiscalNumberContains: '15' }
    expect(table.manifestMatchesFilters(AUTHORIZED_MANIFEST_SUMMARY, byFiscalNumber)).toBeTrue()
    expect(table.manifestMatchesFilters(MANIFEST_SUMMARY, byFiscalNumber)).toBeFalse()

    const byDestination = { ...empty, destinationStates: ['SP'] as const }
    expect(table.countActiveFilters(byDestination)).toBe(1)
    expect(MANIFESTS.filter((m) => table.manifestMatchesFilters(m, byDestination))).toEqual([])

    const byCreated = { ...empty, createdFrom: '2026-07-28' }
    expect(MANIFESTS.filter((m) => table.manifestMatchesFilters(m, byCreated))).toEqual([
      MANIFEST_SUMMARY,
    ])
  })

  test('persists column order and visibility and survives corrupted storage', async () => {
    const table = await loadFutureModule<TableModule>(TABLE_MODULE)
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    }

    expect(table.readColumnPreferences(null).order).toEqual(table.MDFE_MANIFEST_COLUMN_KEYS)
    expect(table.readColumnPreferences(storage).visibility.status).toBeTrue()

    const reordered = table.reorderColumns(table.MDFE_MANIFEST_COLUMN_KEYS, 'status', 'up')
    expect(reordered[0]).toBe('status')
    expect(reordered).toHaveLength(table.MDFE_MANIFEST_COLUMN_KEYS.length)
    expect(table.reorderColumns(reordered, 'status', 'up')).toEqual(reordered)

    table.writeColumnPreferences({
      preferences: {
        order: reordered,
        visibility: { ...table.readColumnPreferences(null).visibility, cargoWeight: false },
      },
      storage,
    })
    expect(store.get(table.MDFE_MANIFEST_COLUMNS_STORAGE_KEY)).toBeString()

    const restored = table.readColumnPreferences(storage)
    expect(restored.order).toEqual(reordered)
    expect(restored.visibility.cargoWeight).toBeFalse()

    store.set(table.MDFE_MANIFEST_COLUMNS_STORAGE_KEY, 'not-json')
    expect(table.readColumnPreferences(storage).order).toEqual(table.MDFE_MANIFEST_COLUMN_KEYS)

    store.set(
      table.MDFE_MANIFEST_COLUMNS_STORAGE_KEY,
      JSON.stringify({ order: ['ghost', 'status'], visibility: { ghost: false, status: 'yes' } }),
    )
    const sanitized = table.readColumnPreferences(storage)
    expect(sanitized.order[0]).toBe('status')
    expect(sanitized.order).toHaveLength(table.MDFE_MANIFEST_COLUMN_KEYS.length)
    expect(sanitized.visibility.status).toBeTrue()
  })
})

describe('mdfe manifest advanced filter contract', () => {
  test('nests and or groups, resets the operator on field change and ignores neutral conditions', async () => {
    const advanced = await loadFutureModule<AdvancedModule>(ADVANCED_MODULE)
    let sequence = 0
    const nextId = (): string => `mdfe-condition-${(sequence += 1)}`

    const model = advanced.createAdvancedFilterModel(nextId)
    expect(model.connector).toBe('and')
    expect(model.groups).toHaveLength(1)
    expect(advanced.countActiveConditions(model)).toBe(0)
    expect(MANIFESTS.every((m) => advanced.evaluateAdvancedFilter(m, model))).toBeTrue()

    expect(advanced.MDFE_MANIFEST_OPERATORS_BY_TYPE.number).toEqual([
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'between',
    ])
    expect(advanced.MDFE_MANIFEST_OPERATORS_BY_TYPE.option).toEqual(['eq', 'ne'])

    const changed = advanced.applyConditionChanges(
      { ...NEUTRAL_CONDITION, value: 'ABC' },
      { field: 'cteCount' },
    )
    expect(changed).toEqual({
      field: 'cteCount',
      id: NEUTRAL_CONDITION.id,
      operator: 'eq',
      value: '',
      valueTo: '',
    })
    expect(advanced.isConditionActive(NEUTRAL_CONDITION)).toBeFalse()

    const andModel = {
      connector: 'and',
      groups: [
        {
          conditions: [STATUS_CONDITION, NEUTRAL_CONDITION],
          connector: 'and',
          id: 'group-1',
        },
      ],
    } as const
    expect(advanced.countActiveConditions(andModel)).toBe(1)
    expect(MANIFESTS.filter((m) => advanced.evaluateAdvancedFilter(m, andModel))).toEqual([
      AUTHORIZED_MANIFEST_SUMMARY,
    ])

    const orModel = {
      connector: 'or',
      groups: [
        { conditions: [STATUS_CONDITION], connector: 'and', id: 'group-1' },
        { conditions: [CTE_COUNT_CONDITION], connector: 'and', id: 'group-2' },
      ],
    } as const
    expect(MANIFESTS.filter((m) => advanced.evaluateAdvancedFilter(m, orModel))).toEqual([
      MANIFEST_SUMMARY,
      AUTHORIZED_MANIFEST_SUMMARY,
    ])

    const andAcrossGroups = { ...orModel, connector: 'and' } as const
    expect(MANIFESTS.filter((m) => advanced.evaluateAdvancedFilter(m, andAcrossGroups))).toEqual([])
  })
})

describe('mdfe manifest actions contract', () => {
  test('exposes issue, close and cancel only where the fiscal state allows', async () => {
    const actions = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)

    expect(actions.resolveManifestActions('draft')).toEqual({
      canCancel: false,
      canClose: false,
      canIssue: true,
    })
    expect(actions.resolveManifestActions('rejected')).toEqual({
      canCancel: false,
      canClose: false,
      canIssue: true,
    })
    expect(actions.resolveManifestActions('issuing')).toEqual({
      canCancel: false,
      canClose: false,
      canIssue: false,
    })
    expect(actions.resolveManifestActions('authorized')).toEqual({
      canCancel: true,
      canClose: true,
      canIssue: false,
    })
    expect(actions.resolveManifestActions('closed')).toEqual({
      canCancel: false,
      canClose: false,
      canIssue: false,
    })
    expect(actions.resolveManifestActions('cancelled')).toEqual({
      canCancel: false,
      canClose: false,
      canIssue: false,
    })
  })

  test('mirrors the sefaz justification and closure city boundaries', async () => {
    const actions = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)

    expect(actions.validateCancellationJustification('   ')).toBe('required')
    expect(actions.validateCancellationJustification('a'.repeat(14))).toBe('tooShort')
    expect(actions.validateCancellationJustification('a'.repeat(15))).toBeNull()
    expect(actions.validateCancellationJustification('a'.repeat(255))).toBeNull()
    expect(actions.validateCancellationJustification('a'.repeat(256))).toBe('tooLong')

    expect(actions.validateClosure({ closureCityCode: '3106200', closureState: 'MG' })).toBeNull()
    expect(actions.validateClosure({ closureCityCode: '310620', closureState: 'MG' })).toBe(
      'invalidCity',
    )
    expect(actions.validateClosure({ closureCityCode: '3106200', closureState: 'mg' })).toBe(
      'invalidState',
    )
    expect(actions.validateClosure({ closureCityCode: '', closureState: '' })).toBe('invalidCity')
  })

  test('turns a preview into a selectable creation draft without losing blocked reasons', async () => {
    const actions = await loadFutureModule<ActionsModule>(ACTIONS_MODULE)
    const draft = actions.createManifestDraftFromPreview(MANIFEST_PREVIEW)

    expect(draft.destinationState).toBe('MG')
    expect(draft.documentIds).toEqual([MANIFEST_PREVIEW.documents[0].fiscalDocumentId])
    expect(draft.blocked).toEqual(MANIFEST_PREVIEW.blocked)
    expect(draft.totals).toEqual(MANIFEST_PREVIEW.totals)
    expect(draft.loadingCityNames).toEqual(['Sao Paulo'])
    expect(draft.dischargeCityNames).toEqual(['Belo Horizonte'])
  })
})

describe('mdfe manifest cte source contract', () => {
  test('offers only authorized CT-es that already carry a fiscal document', async () => {
    const source = await loadFutureModule<CteSourceModule>(CTE_SOURCE_MODULE)

    const candidates = source.collectManifestCteCandidates({
      batch: { id: CTE_BATCH_ID, name: CTE_BATCH.name },
      items: [
        CTE_BATCH_AUTHORIZED_ITEM,
        CTE_BATCH_REJECTED_ITEM,
        CTE_BATCH_CANCELLED_ITEM,
        { ...CTE_BATCH_AUTHORIZED_ITEM, fiscalDocumentId: null, id: 'legacy-item' },
      ],
    })

    expect(candidates).toEqual([
      {
        accessKey: CTE_ISSUED_ACCESS_KEY,
        batchId: CTE_BATCH_ID,
        batchName: CTE_BATCH.name,
        fiscalDocumentId: CTE_FISCAL_DOCUMENT_ID,
        fiscalNumber: '000000011',
        fiscalSeries: '001',
        totalAmount: '47.6316',
      },
    ])
  })

  test('toggles selection without duplicating a fiscal document', async () => {
    const source = await loadFutureModule<CteSourceModule>(CTE_SOURCE_MODULE)

    const selected = source.toggleCteCandidate([], CTE_FISCAL_DOCUMENT_ID)
    expect(selected).toEqual([CTE_FISCAL_DOCUMENT_ID])
    expect(source.toggleCteCandidate(selected, CTE_FISCAL_DOCUMENT_ID)).toEqual([])
    expect(source.toggleCteCandidate(selected, CTE_SECOND_DOCUMENT_ID)).toEqual([
      CTE_FISCAL_DOCUMENT_ID,
      CTE_SECOND_DOCUMENT_ID,
    ])
  })

  test('keeps the selection restricted to the candidates still on screen', async () => {
    const source = await loadFutureModule<CteSourceModule>(CTE_SOURCE_MODULE)
    const candidates = source.collectManifestCteCandidates({
      batch: { id: CTE_BATCH_ID, name: CTE_BATCH.name },
      items: [CTE_BATCH_AUTHORIZED_ITEM],
    })

    expect(
      source.retainSelectableCandidates(candidates, [
        CTE_FISCAL_DOCUMENT_ID,
        CTE_SECOND_DOCUMENT_ID,
      ]),
    ).toEqual([CTE_FISCAL_DOCUMENT_ID])
    expect(source.retainSelectableCandidates([], [CTE_FISCAL_DOCUMENT_ID])).toEqual([])
  })
})

describe('mdfe manifest creation form contract', () => {
  test('blocks a manifest without vehicle, driver, destination or CT-e', async () => {
    const form = await loadFutureModule<FormModule>(FORM_MODULE)

    expect(
      form.validateManifestForm({ documentIds: [], draft: form.EMPTY_MDFE_MANIFEST_FORM }),
    ).toEqual([
      'documentsRequired',
      'vehicleRequired',
      'driverRequired',
      'destinationRequired',
      'cargoProductRequired',
    ])
    expect(
      form.validateManifestForm({
        documentIds: [CTE_FISCAL_DOCUMENT_ID],
        draft: {
          ...form.EMPTY_MDFE_MANIFEST_FORM,
          cargoProduct: 'Bebidas',
          destinationState: 'MG',
          driverIds: ['driver-1'],
          vehicleId: 'vehicle-1',
        },
      }),
    ).toEqual([])
  })

  test('builds a create body that carries no tenant and normalizes the trip start', async () => {
    const form = await loadFutureModule<FormModule>(FORM_MODULE)
    const draft = {
      ...form.EMPTY_MDFE_MANIFEST_FORM,
      additionalInformation: 'Carga paletizada',
      cargoProduct: 'Bebidas',
      cargoProductNcm: '22029900',
      cargoType: '05',
      destinationState: 'MG',
      driverIds: ['driver-1', 'driver-2'],
      transporterType: '1',
      vehicleId: 'vehicle-1',
    }

    const body = form.buildManifestCreateBody({ documentIds: [CTE_FISCAL_DOCUMENT_ID], draft })
    expect(body).toEqual({
      additionalInformation: 'Carga paletizada',
      cargoProduct: 'Bebidas',
      cargoProductNcm: '22029900',
      cargoType: '05',
      cargoUnit: '01',
      contractorName: '',
      contractorTaxId: '',
      destinationState: 'MG',
      dischargePostalCode: '',
      documentIds: [CTE_FISCAL_DOCUMENT_ID],
      driverIds: ['driver-1', 'driver-2'],
      emitterType: '1',
      freightValue: '0.00',
      insuranceEndorsement: '',
      loadingPostalCode: '',
      transporterType: '1',
      tripStartedAt: null,
      vehicleId: 'vehicle-1',
    })
    expect(Object.keys(body)).not.toContain('companyId')

    const scheduled = form.buildManifestCreateBody({
      documentIds: [CTE_FISCAL_DOCUMENT_ID],
      draft: { ...draft, tripStartedAt: '2026-07-28T08:00' },
    })
    expect(scheduled.tripStartedAt).toBe('2026-07-28T08:00')
  })

  // Sem CEP de carregamento, contratante e valor do frete a SEFAZ rejeita a carga lotação (726, 578, 302)
  test('carries the lotacao block and normalizes the freight value to two decimals', async () => {
    const form = await loadFutureModule<FormModule>(FORM_MODULE)
    const draft = {
      ...form.EMPTY_MDFE_MANIFEST_FORM,
      cargoProduct: 'Bebidas',
      contractorName: 'Industria Contratante LTDA',
      contractorTaxId: '11222333000181',
      destinationState: 'MG',
      dischargePostalCode: '30140071',
      driverIds: ['driver-1'],
      freightValue: '2500,5',
      insuranceEndorsement: '123456',
      loadingPostalCode: '14076400',
      vehicleId: 'vehicle-1',
    }

    const body = form.buildManifestCreateBody({ documentIds: [CTE_FISCAL_DOCUMENT_ID], draft })

    expect(body.contractorName).toBe('Industria Contratante LTDA')
    expect(body.contractorTaxId).toBe('11222333000181')
    expect(body.dischargePostalCode).toBe('30140071')
    expect(body.freightValue).toBe('2500.50')
    expect(body.insuranceEndorsement).toBe('123456')
    expect(body.loadingPostalCode).toBe('14076400')
    expect(
      form.buildManifestCreateBody({
        documentIds: [CTE_FISCAL_DOCUMENT_ID],
        draft: { ...draft, freightValue: 'abc' },
      }).freightValue,
    ).toBe('0.00')
  })

  test('toggles drivers keeping the declaration order of the manifest', async () => {
    const form = await loadFutureModule<FormModule>(FORM_MODULE)

    const withFirst = form.toggleDriver([], 'driver-1')
    const withSecond = form.toggleDriver(withFirst, 'driver-2')
    expect(withSecond).toEqual(['driver-1', 'driver-2'])
    expect(form.toggleDriver(withSecond, 'driver-1')).toEqual(['driver-2'])
  })
})

type SortState = null | Readonly<{ column: string; direction: 'asc' | 'desc' }>

type ColumnPreferences = Readonly<{
  order: readonly string[]
  visibility: Readonly<Record<string, boolean>>
}>

type ColumnStorage = Readonly<{
  getItem: (key: string) => null | string
  setItem: (key: string, value: string) => void
}>

type TableFilters = Readonly<{
  createdFrom: string
  createdTo: string
  cteCountFrom: string
  cteCountTo: string
  destinationStates: readonly string[]
  fiscalNumberContains: string
  statuses: readonly string[]
}>

type TableModule = {
  readonly EMPTY_MDFE_MANIFEST_FILTERS: TableFilters
  readonly MDFE_MANIFEST_COLUMNS_STORAGE_KEY: string
  readonly MDFE_MANIFEST_COLUMN_KEYS: readonly string[]
  readonly countActiveFilters: (filters: TableFilters) => number
  readonly manifestMatchesFilters: (
    manifest: MdfeManifestSummaryContract,
    filters: TableFilters,
  ) => boolean
  readonly nextSortState: (current: SortState, column: string) => SortState
  readonly readColumnPreferences: (storage: ColumnStorage | null) => ColumnPreferences
  readonly reorderColumns: (
    order: readonly string[],
    column: string,
    direction: 'down' | 'up',
  ) => readonly string[]
  readonly sortManifests: (
    manifests: readonly MdfeManifestSummaryContract[],
    sort: SortState,
  ) => readonly MdfeManifestSummaryContract[]
  readonly toggleStatusFilter: (statuses: readonly string[], status: string) => readonly string[]
  readonly writeColumnPreferences: (
    input: Readonly<{ preferences: ColumnPreferences; storage: ColumnStorage | null }>,
  ) => void
}

type Condition = Readonly<{
  field: string
  id: string
  operator: string
  value: string
  valueTo: string
}>

type AdvancedFilter = Readonly<{
  connector: 'and' | 'or'
  groups: readonly Readonly<{
    conditions: readonly Condition[]
    connector: 'and' | 'or'
    id: string
  }>[]
}>

type AdvancedModule = {
  readonly MDFE_MANIFEST_OPERATORS_BY_TYPE: Readonly<Record<string, readonly string[]>>
  readonly applyConditionChanges: (
    condition: Condition,
    changes: Readonly<Partial<Condition>>,
  ) => Condition
  readonly countActiveConditions: (model: AdvancedFilter) => number
  readonly createAdvancedFilterModel: (nextId: () => string) => AdvancedFilter
  readonly evaluateAdvancedFilter: (
    manifest: MdfeManifestSummaryContract,
    model: AdvancedFilter,
  ) => boolean
  readonly isConditionActive: (condition: Condition) => boolean
}

type ActionsModule = {
  readonly createManifestDraftFromPreview: (preview: typeof MANIFEST_PREVIEW) => Readonly<{
    blocked: readonly Readonly<{ fiscalDocumentId: string; reason: string }>[]
    destinationState: string
    dischargeCityNames: readonly string[]
    documentIds: readonly string[]
    loadingCityNames: readonly string[]
    totals: Readonly<{ cargoValue: string; cargoWeight: string; cteCount: number }>
  }>
  readonly resolveManifestActions: (status: string) => Readonly<{
    canCancel: boolean
    canClose: boolean
    canIssue: boolean
  }>
  readonly validateCancellationJustification: (
    value: string,
  ) => null | 'required' | 'tooLong' | 'tooShort'
  readonly validateClosure: (
    input: Readonly<{ closureCityCode: string; closureState: string }>,
  ) => null | 'invalidCity' | 'invalidState'
}

type CteCandidate = Readonly<{
  accessKey: string
  batchId: string
  batchName: string
  fiscalDocumentId: string
  fiscalNumber: null | string
  fiscalSeries: null | string
  totalAmount: string
}>

type CteSourceItem = Readonly<{
  accessKey: null | string
  fiscalDocumentId: null | string
  fiscalNumber: null | string
  fiscalSeries: null | string
  id: string
  status: string
  totalAmount: string
}>

type ManifestFormDraft = Readonly<{
  additionalInformation: string
  cargoProduct: string
  cargoProductNcm: string
  cargoType: string
  cargoUnit: string
  contractorName: string
  contractorTaxId: string
  destinationState: string
  dischargePostalCode: string
  driverIds: readonly string[]
  emitterType: string
  freightValue: string
  insuranceEndorsement: string
  loadingPostalCode: string
  transporterType: string
  tripStartedAt: string
  vehicleId: string
}>

type ManifestFormIssue =
  | 'cargoProductRequired'
  | 'destinationRequired'
  | 'documentsRequired'
  | 'driverRequired'
  | 'vehicleRequired'

type FormModule = {
  readonly EMPTY_MDFE_MANIFEST_FORM: ManifestFormDraft
  readonly buildManifestCreateBody: (
    input: Readonly<{ documentIds: readonly string[]; draft: ManifestFormDraft }>,
  ) => Readonly<{ tripStartedAt: null | string }> & Record<string, unknown>
  readonly toggleDriver: (driverIds: readonly string[], driverId: string) => readonly string[]
  readonly validateManifestForm: (
    input: Readonly<{ documentIds: readonly string[]; draft: ManifestFormDraft }>,
  ) => readonly ManifestFormIssue[]
}

type CteSourceModule = {
  readonly collectManifestCteCandidates: (
    input: Readonly<{
      batch: Readonly<{ id: string; name: string }>
      items: readonly CteSourceItem[]
    }>,
  ) => readonly CteCandidate[]
  readonly retainSelectableCandidates: (
    candidates: readonly CteCandidate[],
    selectedIds: readonly string[],
  ) => readonly string[]
  readonly toggleCteCandidate: (
    selectedIds: readonly string[],
    fiscalDocumentId: string,
  ) => readonly string[]
}
