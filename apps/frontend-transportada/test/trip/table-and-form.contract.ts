/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  loadFutureModule,
  SECOND_TRIP,
  SYNTHETIC_CURSOR,
  TRIP,
  TRIP_DOCUMENT_DETAIL,
  VEHICLE_ID,
  type TripStatusContract,
} from './trip.fixture'

describe('trip table contract', () => {
  test('sorts only the current page and toggles asc/desc/none per column', async () => {
    const { nextTripSortState, sortTrips } = await loadFutureModule<TripTableModule>(
      '../../src/modules/trip/shared/tripTable.service',
    )

    const ascending = nextTripSortState(null, 'vehicleId')
    expect(ascending).toEqual({ column: 'vehicleId', direction: 'asc' })
    const descending = nextTripSortState(ascending, 'vehicleId')
    expect(descending).toEqual({ column: 'vehicleId', direction: 'desc' })
    expect(nextTripSortState(descending, 'vehicleId')).toBeNull()
    expect(nextTripSortState(ascending, 'status')).toEqual({ column: 'status', direction: 'asc' })

    const items: readonly TripRow[] = [SECOND_TRIP, TRIP]
    expect(sortTrips(items, null)).toEqual(items)
    expect(sortTrips(items, { column: 'createdAt', direction: 'asc' })).toEqual([SECOND_TRIP, TRIP])
    expect(sortTrips(items, { column: 'createdAt', direction: 'desc' })).toEqual([
      TRIP,
      SECOND_TRIP,
    ])
  })

  test('walks cursor pagination forward and back through history', async () => {
    const { canGoToPreviousTripPage, nextTripPage, previousTripPage, TRIP_FIRST_PAGE } =
      await loadFutureModule<TripTableModule>('../../src/modules/trip/shared/tripTable.service')

    expect(canGoToPreviousTripPage(TRIP_FIRST_PAGE)).toBe(false)

    const secondPage = nextTripPage(TRIP_FIRST_PAGE, SYNTHETIC_CURSOR)
    expect(secondPage).toEqual({ cursor: SYNTHETIC_CURSOR, history: [null] })
    expect(canGoToPreviousTripPage(secondPage)).toBe(true)

    const stayedPage = nextTripPage(secondPage, null)
    expect(stayedPage).toEqual(secondPage)

    expect(previousTripPage(secondPage)).toEqual(TRIP_FIRST_PAGE)
    expect(previousTripPage(TRIP_FIRST_PAGE)).toEqual(TRIP_FIRST_PAGE)
  })

  test('counts only filters carrying a defined, non-empty value', async () => {
    const { countActiveTripFilters } = await loadFutureModule<TripTableModule>(
      '../../src/modules/trip/shared/tripTable.service',
    )

    expect(countActiveTripFilters({})).toBe(0)
    expect(countActiveTripFilters({ statusEq: 'draft', vehicleIdEq: '' })).toBe(1)
    expect(
      countActiveTripFilters({
        createdFrom: '2026-07-01',
        statusEq: 'draft',
        vehicleIdEq: VEHICLE_ID,
      }),
    ).toBe(3)
  })
})

describe('trip filter pills contract', () => {
  test('describes only the active filters and clears a single field at a time', async () => {
    const { clearTripFilterField, describeTripFilterPills } =
      await loadFutureModule<TripFilterPillsModule>(
        '../../src/modules/trip/shared/tripFilterPills.service',
      )
    const formatDay = (value: string) => value

    expect(describeTripFilterPills({ filters: {}, formatDay })).toEqual([])

    const filters = {
      createdFrom: '2026-07-01',
      createdUntil: '2026-07-31',
      driverIdEq: 'driver-1',
      statusEq: 'draft' as const,
      vehicleIdEq: VEHICLE_ID,
    }
    const pills = describeTripFilterPills({ filters, formatDay })
    expect(pills.map((pill) => pill.field)).toEqual([
      'statusEq',
      'vehicleIdEq',
      'driverIdEq',
      'createdRange',
    ])

    expect(clearTripFilterField({ field: 'statusEq', filters })).not.toHaveProperty('statusEq')
    expect(clearTripFilterField({ field: 'vehicleIdEq', filters })).not.toHaveProperty(
      'vehicleIdEq',
    )
    expect(clearTripFilterField({ field: 'driverIdEq', filters })).not.toHaveProperty('driverIdEq')
    const clearedRange = clearTripFilterField({ field: 'createdRange', filters })
    expect(clearedRange).not.toHaveProperty('createdFrom')
    expect(clearedRange).not.toHaveProperty('createdUntil')
  })
})

describe('trip form contract', () => {
  test('requires a vehicle and at least one driver before a trip can be created', async () => {
    const { validateTripForm } = await loadFutureModule<TripFormModule>(
      '../../src/modules/trip/shared/tripForm.service',
    )

    expect(validateTripForm({ driverIds: [], vehicleId: '' })).toEqual([
      'vehicleRequired',
      'driverRequired',
    ])
    expect(validateTripForm({ driverIds: ['driver-1'], vehicleId: '' })).toEqual([
      'vehicleRequired',
    ])
    expect(validateTripForm({ driverIds: [], vehicleId: VEHICLE_ID })).toEqual(['driverRequired'])
    expect(validateTripForm({ driverIds: ['driver-1'], vehicleId: VEHICLE_ID })).toEqual([])
  })

  test('maps the link draft to exactly one of freightCalculationId or nfeDocumentId', async () => {
    const { buildLinkTripDocumentBody } = await loadFutureModule<TripFormModule>(
      '../../src/modules/trip/shared/tripForm.service',
    )

    expect(buildLinkTripDocumentBody({ mode: 'nfe', value: 'nfe-1' })).toEqual({
      freightCalculationId: null,
      nfeDocumentId: 'nfe-1',
    })
    expect(buildLinkTripDocumentBody({ mode: 'freight', value: 'freight-1' })).toEqual({
      freightCalculationId: 'freight-1',
      nfeDocumentId: null,
    })
  })
})

describe('trip mdfe gate contract', () => {
  test('blocks issuance until every linked document has an authorized CT-e', async () => {
    const { canIssueMdfe, selectPendingCteDocuments } = await loadFutureModule<TripMdfeGateModule>(
      '../../src/modules/trip/shared/tripMdfeGate.service',
    )

    const authorized = { ...TRIP_DOCUMENT_DETAIL, cteAuthorized: true }
    const pending = { ...TRIP_DOCUMENT_DETAIL, cteAuthorized: false, id: 'other-document-id' }

    expect(selectPendingCteDocuments([authorized])).toEqual([])
    expect(selectPendingCteDocuments([authorized, pending])).toEqual([pending])
    expect(canIssueMdfe([])).toBe(false)
    expect(canIssueMdfe([authorized])).toBe(true)
    expect(canIssueMdfe([authorized, pending])).toBe(false)
  })
})

describe('trip fiscal warning contract', () => {
  test('flags cancelled, denied and rejected documents without disabling the MDF-e action', async () => {
    const {
      hasTripDocumentFiscalWarning,
      hasTripFiscalWarning,
      tripDocumentLabel,
      tripFiscalStatusKey,
    } = await loadFutureModule<TripDocumentModule>(
      '../../src/modules/trip/shared/tripDocument.service',
    )
    const { canIssueMdfe } = await loadFutureModule<TripMdfeGateModule>(
      '../../src/modules/trip/shared/tripMdfeGate.service',
    )

    const cancelled = { ...TRIP_DOCUMENT_DETAIL, cteAuthorized: true, fiscalStatus: 'cancelled' }
    const denied = { ...TRIP_DOCUMENT_DETAIL, cteAuthorized: true, fiscalStatus: 'denied' }
    const rejected = { ...TRIP_DOCUMENT_DETAIL, cteAuthorized: true, fiscalStatus: 'rejected' }

    expect(hasTripDocumentFiscalWarning(TRIP_DOCUMENT_DETAIL)).toBe(false)
    expect(hasTripDocumentFiscalWarning(cancelled)).toBe(true)
    expect(hasTripDocumentFiscalWarning(denied)).toBe(true)
    expect(hasTripDocumentFiscalWarning(rejected)).toBe(true)
    expect(hasTripFiscalWarning([TRIP_DOCUMENT_DETAIL, cancelled])).toBe(true)
    expect(hasTripFiscalWarning([TRIP_DOCUMENT_DETAIL])).toBe(false)

    expect(canIssueMdfe([cancelled])).toBe(true)
    expect(canIssueMdfe([TRIP_DOCUMENT_DETAIL, cancelled])).toBe(true)

    expect(tripFiscalStatusKey('cancelled')).toBe('fiscalStatus.cancelled')
    expect(tripDocumentLabel(TRIP_DOCUMENT_DETAIL)).toBe(TRIP_DOCUMENT_DETAIL.nfeDocumentId)
  })
})

describe('trip feedback contract', () => {
  test('surfaces the first pending mutation error and falls back to requestFailed', async () => {
    const { resolveFirstTripFeedbackKey, resolveTripFeedbackKey } =
      await loadFutureModule<TripFeedbackModule>(
        '../../src/modules/trip/shared/tripFeedback.service',
      )

    expect(resolveTripFeedbackKey(null)).toBeNull()
    expect(resolveTripFeedbackKey(new Error('TRIP_CLOSED'))).toBe('closed')
    expect(resolveTripFeedbackKey(new Error('UNKNOWN'))).toBe('requestFailed')
    expect(resolveFirstTripFeedbackKey([null, null])).toBeNull()
    expect(
      resolveFirstTripFeedbackKey([
        null,
        new Error('TRIP_DOCUMENT_ALREADY_DELIVERED'),
        new Error('TRIP_CLOSED'),
      ]),
    ).toBe('documentAlreadyDelivered')
  })
})

describe('trip query status contract', () => {
  test('answers forbidden instead of an eternal loading when the user cannot read trips', async () => {
    const { resolveQueryStatus } = await loadFutureModule<TripQueryStatusModule>(
      '../../src/modules/trip/hooks/useTripWorkspace.hook',
    )

    expect(resolveQueryStatus({ canRead: false, isError: false, isPending: true })).toBe(
      'forbidden',
    )
    expect(resolveQueryStatus({ canRead: true, isError: true, isPending: false })).toBe('error')
    expect(resolveQueryStatus({ canRead: true, isError: false, isPending: true })).toBe('loading')
    expect(resolveQueryStatus({ canRead: true, isError: false, isPending: false })).toBe('success')
  })
})

describe('trip navigation contract', () => {
  test('navigating to the mdfe manifests screen pushes the path, remembers the workspace and resyncs the shell', async () => {
    const { MDFE_MANIFEST_ROUTE, MDFE_MANIFEST_WORKSPACE, navigateToMdfeManifests } =
      await loadFutureModule<TripNavigationModule>(
        '../../src/modules/trip/shared/tripNavigation.service',
      )
    const spy = createNavigatorSpy()

    navigateToMdfeManifests({ navigator: spy.navigator })

    expect(spy.calls).toEqual([
      `pushPath:${MDFE_MANIFEST_ROUTE}`,
      `rememberWorkspace:${MDFE_MANIFEST_WORKSPACE}`,
      'dispatchPopState',
    ])
  })

  test('carries the origin trip in the query string so the manifest is born with trip_id', async () => {
    const { MDFE_MANIFEST_ROUTE, navigateToMdfeManifests } =
      await loadFutureModule<TripNavigationModule>(
        '../../src/modules/trip/shared/tripNavigation.service',
      )
    const spy = createNavigatorSpy()

    navigateToMdfeManifests({ navigator: spy.navigator, tripId: TRIP.id })

    expect(spy.calls[0]).toBe(`pushPath:${MDFE_MANIFEST_ROUTE}?tripId=${TRIP.id}`)
  })

  test('navigating to the nfe workspace pushes the path, remembers the workspace and resyncs the shell', async () => {
    const { navigateToNfeWorkspace, NFE_WORKSPACE, NFE_WORKSPACE_ROUTE } =
      await loadFutureModule<TripNavigationModule>(
        '../../src/modules/trip/shared/tripNavigation.service',
      )
    const spy = createNavigatorSpy()

    navigateToNfeWorkspace(spy.navigator)

    expect(spy.calls).toEqual([
      `pushPath:${NFE_WORKSPACE_ROUTE}`,
      `rememberWorkspace:${NFE_WORKSPACE}`,
      'dispatchPopState',
    ])
  })
})

function createNavigatorSpy(): Readonly<{
  calls: readonly string[]
  navigator: WorkspaceNavigatorSpy
}> {
  const calls: string[] = []
  return {
    calls,
    navigator: {
      dispatchPopState: () => calls.push('dispatchPopState'),
      pushPath: (path) => calls.push(`pushPath:${path}`),
      rememberWorkspace: (workspace) => calls.push(`rememberWorkspace:${workspace}`),
    },
  }
}

type WorkspaceNavigatorSpy = Readonly<{
  dispatchPopState: () => void
  pushPath: (path: string) => void
  rememberWorkspace: (workspace: string) => void
}>

type TripDocumentDetailRow = Readonly<{
  cteAuthorized: boolean
  fiscalStatus: string
  id: string
}>

type TripMdfeGateModule = {
  readonly canIssueMdfe: (documents: readonly TripDocumentDetailRow[]) => boolean
  readonly selectPendingCteDocuments: (
    documents: readonly TripDocumentDetailRow[],
  ) => readonly TripDocumentDetailRow[]
}

type TripDocumentModule = {
  readonly hasTripDocumentFiscalWarning: (document: TripDocumentDetailRow) => boolean
  readonly hasTripFiscalWarning: (documents: readonly TripDocumentDetailRow[]) => boolean
  readonly tripDocumentLabel: (document: TripDocumentDetailRow) => string
  readonly tripFiscalStatusKey: (fiscalStatus: string) => string
}

type TripFeedbackModule = {
  readonly resolveFirstTripFeedbackKey: (errors: readonly unknown[]) => null | string
  readonly resolveTripFeedbackKey: (error: unknown) => null | string
}

type TripQueryStatusModule = {
  readonly resolveQueryStatus: (
    input: Readonly<{ canRead: boolean; isError: boolean; isPending: boolean }>,
  ) => 'error' | 'forbidden' | 'loading' | 'success'
}

type TripNavigationModule = {
  readonly MDFE_MANIFEST_ROUTE: string
  readonly MDFE_MANIFEST_WORKSPACE: string
  readonly navigateToMdfeManifests: (
    input: Readonly<{ navigator: WorkspaceNavigatorSpy; tripId?: string }>,
  ) => void
  readonly navigateToNfeWorkspace: (navigator: WorkspaceNavigatorSpy) => void
  readonly NFE_WORKSPACE: string
  readonly NFE_WORKSPACE_ROUTE: string
}

type TripColumnKey = 'createdAt' | 'status' | 'updatedAt' | 'vehicleId'
type TripSortState = null | Readonly<{ column: TripColumnKey; direction: 'asc' | 'desc' }>
type TripPageState = Readonly<{ cursor: null | string; history: readonly (null | string)[] }>
type TripFilters = Readonly<{
  createdFrom?: string
  createdUntil?: string
  driverIdEq?: string
  statusEq?: TripStatusContract
  vehicleIdEq?: string
}>
type TripRow = Readonly<{
  companyId: string
  createdAt: string
  id: string
  status: TripStatusContract
  updatedAt: string
  vehicleId: string
}>

type TripTableModule = {
  readonly canGoToPreviousTripPage: (state: TripPageState) => boolean
  readonly countActiveTripFilters: (filters: TripFilters) => number
  readonly nextTripPage: (state: TripPageState, nextCursor: null | string) => TripPageState
  readonly nextTripSortState: (current: TripSortState, column: TripColumnKey) => TripSortState
  readonly previousTripPage: (state: TripPageState) => TripPageState
  readonly sortTrips: (items: readonly TripRow[], sort: TripSortState) => readonly TripRow[]
  readonly TRIP_FIRST_PAGE: TripPageState
}

type TripFilterPillsModule = {
  readonly clearTripFilterField: (input: {
    readonly field: 'createdRange' | 'driverIdEq' | 'statusEq' | 'vehicleIdEq'
    readonly filters: TripFilters
  }) => TripFilters
  readonly describeTripFilterPills: (input: {
    readonly filters: TripFilters
    readonly formatDay: (value: string) => string
  }) => readonly Readonly<{ field: string }>[]
}

type TripFormModule = {
  readonly buildLinkTripDocumentBody: (
    draft: Readonly<{ mode: 'freight' | 'nfe'; value: string }>,
  ) => Readonly<{ freightCalculationId: null | string; nfeDocumentId: null | string }>
  readonly validateTripForm: (
    draft: Readonly<{ driverIds: readonly string[]; vehicleId: string }>,
  ) => readonly string[]
}
