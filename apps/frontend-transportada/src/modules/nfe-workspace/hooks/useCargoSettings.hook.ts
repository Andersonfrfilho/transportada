import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createCompanySettingsClient } from '@/modules/company-settings/shared/companySettingsClient.service'
import { NFE_DOCUMENTS_QUERY_KEY } from '../shared/nfeWorkspace.constant'
import type { CargoSettings } from '@/modules/company-settings/shared/cargoSettings.validation'

const CARGO_SETTINGS_QUERY_KEY = 'company-cargo-settings'

function createClient() {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function useCargoSettings(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const client = createClient()
  const queryKey = [CARGO_SETTINGS_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.getCargoSettings(),
    queryKey,
  })
  /**
   * Mudar o peso padrão muda a elegibilidade de toda nota sem peso — a coluna de bloqueio da
   * tabela de Notas deixa de dizer a verdade na mesma hora. Por isso a invalidação é ampla aqui.
   */
  const saveMutation = useMutation({
    mutationFn: (defaultVolumeWeight: string | null) =>
      defaultVolumeWeight === null
        ? client
            .clearDefaultVolumeWeight()
            .then((): CargoSettings => ({ defaultVolumeWeight: null }))
        : client.setDefaultVolumeWeight(defaultVolumeWeight),
    onSuccess(settings) {
      queryClient.setQueryData(queryKey, settings)
      void queryClient.invalidateQueries({ queryKey: [NFE_DOCUMENTS_QUERY_KEY] })
    },
  })

  return { query, saveMutation }
}
