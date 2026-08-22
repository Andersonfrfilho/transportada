/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createCompanySettingsClient,
  type EnergySettings,
} from '@/modules/company-settings/shared/companySettingsClient.service'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

const ENERGY_SETTINGS_QUERY_KEY = 'company-energy-settings'

export type EnergyDistributorChoice = Readonly<{
  adjustmentFactor: string
  distributorCode: string
}>

export type EnergySettingsController = Readonly<{
  choose: (input: EnergyDistributorChoice) => Promise<EnergySettings>
  clear: () => Promise<void>
  read: () => Promise<EnergySettings>
}>

function createClient() {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function createEnergySettingsController(
  client: ReturnType<typeof createCompanySettingsClient>,
): EnergySettingsController {
  return {
    choose: (input) => client.chooseEnergyDistributor(input),
    clear: () => client.clearEnergyDistributor(),
    read: () => client.getEnergySettings(),
  }
}

export function useEnergySettings(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const controller = createEnergySettingsController(createClient())
  const queryKey = [ENERGY_SETTINGS_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: controller.read,
    queryKey,
  })
  const chooseMutation = useMutation({
    mutationFn: controller.choose,
    onSuccess(settings) {
      queryClient.setQueryData(queryKey, settings)
    },
  })
  const clearMutation = useMutation({
    mutationFn: controller.clear,
    /** Limpar devolve 204: o catálogo servido junto da escolha só volta inteiro pela releitura. */
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
  return { chooseMutation, clearMutation, query }
}
