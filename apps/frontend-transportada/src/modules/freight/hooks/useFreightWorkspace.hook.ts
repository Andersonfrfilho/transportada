/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createFreightClient,
  type FreightClient as Client,
  type FreightCalculationFilters,
  type FreightRuleCreate,
  type FreightRuleFilters,
  type FreightSimulationResult,
  type FreightSimulationRequest,
} from '../shared/freightClient.service'

const SETTINGS_MANAGE = 'settings.manage'
const FREIGHT_SIMULATE = 'freight.simulate'
const FREIGHT_RULES_QUERY_KEY = 'freight-rules'
const FREIGHT_CALCULATIONS_QUERY_KEY = 'freight-calculations'

export type FreightClient = Client

export type FreightController = Readonly<{
  canManageRules: boolean
  canSimulateFreight: boolean
  createRule: (input: FreightRuleCreate) => Promise<void>
  simulateFreight: (input: FreightSimulationRequest) => Promise<FreightSimulationResult>
}>

type ControllerInput = Readonly<{
  client: FreightClient
  permissions: readonly string[]
}>

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function forbidden(): Promise<never> {
  return Promise.reject(new Error('FREIGHT_FORBIDDEN'))
}

export function createFreightController(input: ControllerInput): FreightController {
  const canManageRules = input.permissions.includes(SETTINGS_MANAGE)
  const canSimulateFreight = input.permissions.includes(FREIGHT_SIMULATE)

  return {
    canManageRules,
    canSimulateFreight,
    createRule: (request) =>
      canManageRules ? input.client.createRule(request).then(() => undefined) : forbidden(),
    simulateFreight: (request) =>
      canSimulateFreight ? input.client.simulateFreight(request) : forbidden(),
  }
}

function getFreightClient(): FreightClient {
  return createFreightClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: createIdempotencyKey,
  })
}

export function useFreightWorkspace(
  input: Readonly<{
    companyId?: string
    documentId?: string
    calculationFilters?: FreightCalculationFilters
    permissions: readonly string[]
    ruleFilters?: FreightRuleFilters
  }>,
) {
  const client = getFreightClient()
  const controller = createFreightController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const queryClient = useQueryClient()
  const rulesQueryKey = [FREIGHT_RULES_QUERY_KEY, input.companyId, input.ruleFilters] as const
  const calculationsQueryKey = [
    FREIGHT_CALCULATIONS_QUERY_KEY,
    input.companyId,
    input.calculationFilters,
    input.documentId,
  ] as const

  const rulesQuery = useQuery({
    enabled: controller.canManageRules,
    queryFn: () =>
      client.listRules({
        cursor: null,
        ...(input.ruleFilters === undefined ? {} : { filters: input.ruleFilters }),
        limit: 25,
      }),
    queryKey: rulesQueryKey,
  })
  const calculationsQuery = useQuery({
    enabled: controller.canSimulateFreight && input.documentId !== undefined,
    queryFn: () =>
      client.listCalculations({
        cursor: null,
        documentId: input.documentId ?? '',
        ...(input.calculationFilters === undefined ? {} : { filters: input.calculationFilters }),
        limit: 10,
      }),
    queryKey: calculationsQueryKey,
  })
  const createRuleMutation = useMutation({
    mutationFn: controller.createRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesQueryKey }),
  })
  const simulateMutation = useMutation({
    mutationFn: controller.simulateFreight,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calculationsQueryKey }),
  })

  return {
    calculationsQuery,
    canManageRules: controller.canManageRules,
    canSimulateFreight: controller.canSimulateFreight,
    controller,
    createRuleMutation,
    newIdempotencyKey: createIdempotencyKey,
    rulesQuery,
    simulateMutation,
  }
}
