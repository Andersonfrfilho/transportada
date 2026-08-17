/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createCompanySettingsClient,
  type FuelPriceEntry,
} from '@/modules/company-settings/shared/companySettingsClient.service'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import type { FuelProduct } from '@/modules/shared/fuel.constant'

const FUEL_PRICES_QUERY_KEY = 'company-fuel-prices'

export type FuelPriceAdjustment = Readonly<{ pricePerUnit: string; product: FuelProduct }>

export type FuelPriceController = Readonly<{
  adjust: (input: FuelPriceAdjustment) => Promise<FuelPriceEntry>
  clear: (product: FuelProduct) => Promise<void>
  read: () => Promise<readonly FuelPriceEntry[]>
}>

function createClient() {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function createFuelPriceController(
  client: ReturnType<typeof createCompanySettingsClient>,
): FuelPriceController {
  return {
    adjust: (input) => client.adjustFuelPrice(input),
    clear: (product) => client.clearFuelPrice(product),
    read: () => client.getFuelPrices(),
  }
}

export function useFuelPrices(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const controller = createFuelPriceController(createClient())
  const queryKey = [FUEL_PRICES_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: controller.read,
    queryKey,
  })
  const adjustMutation = useMutation({
    mutationFn: controller.adjust,
    onSuccess(entry) {
      queryClient.setQueryData(queryKey, (current: readonly FuelPriceEntry[] | undefined) =>
        current?.map((price) => (price.product === entry.product ? entry : price)),
      )
    },
  })
  const clearMutation = useMutation({
    mutationFn: controller.clear,
    /** Limpar devolve 204: só a releitura sabe qual preço da ANP voltou a valer para o produto. */
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
  return { adjustMutation, clearMutation, query }
}
