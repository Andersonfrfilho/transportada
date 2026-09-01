/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { readInstallationBrand, type InstallationBrand } from '../shared/installationBrand.service'

const INSTALLATION_BRAND_QUERY_KEY = ['identity', 'installation-brand'] as const
/** A marca muda raramente e é a mesma para toda a instalação: uma leitura por sessão basta. */
const BRAND_STALE_TIME_MILLISECONDS = 300_000

/**
 * A mesma leitura que a tela de entrar faz, aqui dentro do provedor de consultas — telas
 * autenticadas não carregam dado de API com `useEffect` + `useState`.
 */
export function useInstallationBrand() {
  return useQuery<InstallationBrand>({
    queryFn: () =>
      readInstallationBrand({
        apiUrl: getIdentityEnvironment().apiBaseUrl,
        fetch: globalThis.fetch.bind(globalThis),
      }),
    queryKey: INSTALLATION_BRAND_QUERY_KEY,
    staleTime: BRAND_STALE_TIME_MILLISECONDS,
  })
}
