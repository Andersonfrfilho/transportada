/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createPackageBoxClient } from '../shared/packageBoxClient.service'

const CAMERA_MEASUREMENT_SETTINGS_QUERY_KEY = 'nfe-package-boxes-measurement-settings'

function createClient() {
  return createPackageBoxClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Spec 152 D14: quem mede tem `cargo.measure`, não `settings.manage` — por isso esta é uma leitura
 * própria (`GET /nfe-package-boxes/measurement-settings`), separada do painel de configuração da
 * empresa (`useCargoSettings`). Desligado (ausência de linha ou `false`): a etapa Medida não existe
 * para o conferente, e o worker do OpenCV nunca é criado.
 */
export function useCameraMeasurementSettings(
  input: Readonly<{ companyId?: string; enabled: boolean }>,
) {
  const client = createClient()
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.getMeasurementSettings(),
    queryKey: [CAMERA_MEASUREMENT_SETTINGS_QUERY_KEY, input.companyId] as const,
  })

  return {
    /** Padrão seguro: enquanto não carregou (ou falhou), a etapa Medida fica indisponível. */
    cameraMeasurementEnabled: query.data?.cameraMeasurementEnabled ?? false,
    isLoading: query.isLoading,
  }
}
