import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  createCompanySettingsClient,
  type TollBoothChargeEntry,
} from '@/modules/company-settings/shared/companySettingsClient.service'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { TOLL_BOOTH_CATALOG_QUERY_KEY } from './useTollBoothCatalog.hook'

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
  }
}

/**
 * ⚠️ Spec 154 T204: a leitura saiu daqui — a aba de pedágio passou a ler o catálogo inteiro por
 * `useTollBoothCatalog.hook.ts`. Este hook segue sendo quem grava o ajuste (`PUT`/`DELETE
 * /company-settings/toll-booth-charges/:osmNodeId`, spec 095), e invalida as duas consultas: a
 * praça ajustada mora nas duas listas.
 */
export function useTollBoothCharges() {
  const queryClient = useQueryClient()
  const controller = createTollBoothChargeController(createClient())

  function invalidateTollBoothQueries(): void {
    void queryClient.invalidateQueries({ queryKey: [TOLL_BOOTH_CATALOG_QUERY_KEY] })
  }

  const adjustMutation = useMutation({
    mutationFn: controller.adjust,
    onSuccess: invalidateTollBoothQueries,
  })
  const clearMutation = useMutation({
    mutationFn: controller.clear,
    onSuccess: invalidateTollBoothQueries,
  })
  return { adjustMutation, clearMutation }
}
