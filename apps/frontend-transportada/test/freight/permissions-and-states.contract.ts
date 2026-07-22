/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  FREIGHT_CALCULATION_LIST_PAGE,
  FREIGHT_DOCUMENT,
  FREIGHT_RULE_CREATE,
  FREIGHT_RULE_LIST_PAGE,
  FREIGHT_SIMULATE,
  FREIGHT_SIMULATION_REQUEST,
  FREIGHT_SIMULATION_RESULT,
  SETTINGS_MANAGE,
  loadFutureModule,
} from './freight.fixture'

describe('freight permissions and states contract', () => {
  test('exposes rule controls only to settings.manage and simulation controls only to freight.simulate', async () => {
    const { createFreightController } = await loadFutureModule<FreightHookModule>(
      '../../src/modules/freight/hooks/useFreightWorkspace.hook',
    )
    const client = createMutationRecordingClient()

    const forbiddenController = createFreightController({ client, permissions: [] })
    expect(forbiddenController.canManageRules).toBe(false)
    expect(forbiddenController.canSimulateFreight).toBe(false)
    expect(
      await forbiddenController.createRule(FREIGHT_RULE_CREATE).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FREIGHT_FORBIDDEN' }))
    expect(
      await forbiddenController
        .simulateFreight(FREIGHT_SIMULATION_REQUEST)
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FREIGHT_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const settingsController = createFreightController({
      client,
      permissions: [SETTINGS_MANAGE],
    })
    expect(settingsController.canManageRules).toBe(true)
    expect(settingsController.canSimulateFreight).toBe(false)

    const operatorController = createFreightController({
      client,
      permissions: [FREIGHT_SIMULATE],
    })
    expect(operatorController.canManageRules).toBe(false)
    expect(operatorController.canSimulateFreight).toBe(true)
  })

  test('maps empty, simulation-ready, minimum-or-maximum-adjusted and forbidden states without exposing fiscal payload', async () => {
    const { createFreightViewModel } = await loadFutureModule<FreightViewModelModule>(
      '../../src/modules/freight/shared/freightViewModel.service',
    )

    expect(
      createFreightViewModel({
        documents: [FREIGHT_DOCUMENT],
        permissions: [],
        rules: FREIGHT_RULE_LIST_PAGE,
        status: 'success',
      }),
    ).toEqual({
      canManageRules: false,
      canSimulateFreight: false,
      status: 'forbidden',
    })

    expect(
      createFreightViewModel({
        calculations: { items: [], nextCursor: null },
        documents: [],
        permissions: [SETTINGS_MANAGE, FREIGHT_SIMULATE],
        rules: { items: [], nextCursor: null },
        status: 'success',
      }),
    ).toEqual({
      canManageRules: true,
      canSimulateFreight: true,
      status: 'empty',
    })

    const readyViewModel = createFreightViewModel({
      calculations: FREIGHT_CALCULATION_LIST_PAGE,
      documents: [FREIGHT_DOCUMENT],
      permissions: [SETTINGS_MANAGE, FREIGHT_SIMULATE],
      rules: FREIGHT_RULE_LIST_PAGE,
      simulation: FREIGHT_SIMULATION_RESULT,
      status: 'success',
    })
    expect(readyViewModel.status).toBe('ready')
    expect(readyViewModel.selectedDocumentId).toBe(FREIGHT_DOCUMENT.id)
    expect(readyViewModel.hasAdjustment).toBe(false)
    expect(JSON.stringify(readyViewModel)).not.toContain('<nfeProc')

    const adjustedViewModel = createFreightViewModel({
      calculations: FREIGHT_CALCULATION_LIST_PAGE,
      documents: [FREIGHT_DOCUMENT],
      permissions: [SETTINGS_MANAGE, FREIGHT_SIMULATE],
      rules: FREIGHT_RULE_LIST_PAGE,
      simulation: {
        ...FREIGHT_SIMULATION_RESULT,
        adjustments: [
          {
            amount: '50.0000',
            description: 'Minimum applied',
            type: 'minimum_amount',
          },
        ],
      },
      status: 'success',
    })
    expect(adjustedViewModel.status).toBe('adjusted')
    expect(adjustedViewModel.hasAdjustment).toBe(true)

    expect(
      createFreightViewModel({
        permissions: [FREIGHT_SIMULATE],
        status: 'error',
      }),
    ).toEqual({
      canManageRules: false,
      canSimulateFreight: true,
      status: 'error',
    })
  })
})

function createMutationRecordingClient(): FreightClient & { readonly mutationCount: number } {
  let mutationCount = 0

  return {
    createRule: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
    listCalculations: () => Promise.resolve(FREIGHT_CALCULATION_LIST_PAGE),
    listRules: () => Promise.resolve(FREIGHT_RULE_LIST_PAGE),
    get mutationCount(): number {
      return mutationCount
    },
    simulateFreight: () => {
      mutationCount += 1
      return Promise.resolve(undefined)
    },
  }
}

type FreightClient = {
  createRule(input: typeof FREIGHT_RULE_CREATE): Promise<unknown>
  listCalculations(input: {
    readonly cursor: null | string
    readonly documentId: string
    readonly limit: number
  }): Promise<unknown>
  listRules(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  simulateFreight(input: typeof FREIGHT_SIMULATION_REQUEST): Promise<unknown>
}

type FreightHookModule = {
  readonly createFreightController: (input: {
    readonly client: FreightClient
    readonly permissions: readonly string[]
  }) => {
    readonly canManageRules: boolean
    readonly canSimulateFreight: boolean
    readonly createRule: (input: typeof FREIGHT_RULE_CREATE) => Promise<void>
    readonly simulateFreight: (input: typeof FREIGHT_SIMULATION_REQUEST) => Promise<void>
  }
}

type FreightViewModelModule = {
  readonly createFreightViewModel: (input: {
    readonly calculations?: unknown
    readonly documents?: unknown
    readonly permissions: readonly string[]
    readonly rules?: unknown
    readonly simulation?: unknown
    readonly status: 'error' | 'loading' | 'success'
  }) => {
    readonly canManageRules: boolean
    readonly canSimulateFreight: boolean
    readonly hasAdjustment?: boolean
    readonly selectedDocumentId?: string
    readonly status: 'adjusted' | 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'
  }
}
