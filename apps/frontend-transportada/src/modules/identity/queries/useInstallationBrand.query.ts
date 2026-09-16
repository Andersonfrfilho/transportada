/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import {
  mergeInstallationBrand,
  readCachedInstallationBrand,
  writeCachedInstallationBrand,
} from '../shared/installationBrandCache.service'
import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { readInstallationBrand, type InstallationBrand } from '../shared/installationBrand.service'

const INSTALLATION_BRAND_QUERY_KEY = ['identity', 'installation-brand'] as const
/** A marca muda raramente e é a mesma para toda a instalação: uma leitura por sessão basta. */
const BRAND_STALE_TIME_MILLISECONDS = 300_000

/**
 * A mesma leitura que a tela de entrar faz, aqui dentro do provedor de consultas — telas
 * autenticadas não carregam dado de API com `useEffect` + `useState`.
 *
 * A marca guardada da última visita é o primeiro quadro: sem ela, cada abertura passava pelo
 * esqueleto antes da transportadora. `initialDataUpdatedAt: 0` faz a API conferir mesmo assim, e o
 * compartilhamento estrutural do TanStack só redesenha se o dado vier diferente.
 */
export function useInstallationBrand() {
  return useQuery<InstallationBrand>({
    initialData: readCachedInstallationBrand,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const fetched = await readInstallationBrand({
        apiUrl: getIdentityEnvironment().apiBaseUrl,
        fetch: globalThis.fetch.bind(globalThis),
      })
      const brand = mergeInstallationBrand({ cached: readCachedInstallationBrand(), fetched })
      writeCachedInstallationBrand(brand)
      return brand
    },
    queryKey: INSTALLATION_BRAND_QUERY_KEY,
    /** O padrão global é não repetir: uma falha deixava o produto no lugar da empresa até o reload. */
    retry: 2,
    staleTime: BRAND_STALE_TIME_MILLISECONDS,
  })
}
