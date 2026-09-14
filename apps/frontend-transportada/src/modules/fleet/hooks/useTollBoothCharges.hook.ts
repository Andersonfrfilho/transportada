import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createCompanySettingsClient,
  type TollBoothChargeEntry,
} from '@/modules/company-settings/shared/companySettingsClient.service'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

const TOLL_BOOTH_CHARGES_QUERY_KEY = 'company-toll-booth-charges'

export type TollBoothChargeAdjustment = Readonly<{
  chargeCar?: string | null
  chargePerAxle?: string | null
  chargePerAxleAutomatic?: string | null
  observedOn: string
  osmNodeId: number
}>

export type TollBoothChargeController = Readonly<{
  adjust: (input: TollBoothChargeAdjustment) => Promise<TollBoothChargeEntry>
  clear: (osmNodeId: number) => Promise<void>
  read: () => Promise<readonly TollBoothChargeEntry[]>
}>

function createClient() {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function createTollBoothChargeController(
  client: ReturnType<typeof createCompanySettingsClient>,
): TollBoothChargeController {
  return {
    adjust: (input) => client.adjustTollBoothCharge(input),
    clear: (osmNodeId) => client.clearTollBoothCharge(osmNodeId),
    read: () => client.getTollBoothCharges(),
  }
}

export function useTollBoothCharges(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const controller = createTollBoothChargeController(createClient())
  const queryKey = [TOLL_BOOTH_CHARGES_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: controller.read,
    queryKey,
  })
  const adjustMutation = useMutation({
    mutationFn: controller.adjust,
    /**
     * A ordem (sem tarifa primeiro) pode mudar com o ajuste, e recalculá-la aqui duplicaria a
     * política do servidor — a releitura é o que garante a mesma ordem que o `GET` devolveria.
     */
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
  const clearMutation = useMutation({
    mutationFn: controller.clear,
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
  return { adjustMutation, clearMutation, query }
}
