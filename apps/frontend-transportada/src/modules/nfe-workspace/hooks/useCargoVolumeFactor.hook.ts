/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createCompanySettingsClient } from '@/modules/company-settings/shared/companySettingsClient.service'
import type { CargoVolumeFactor } from '@/modules/company-settings/shared/cargoVolumeFactor.validation'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

const CARGO_VOLUME_QUERY_KEY = 'company-cargo-volume-factors'

/** A espécie vazia é a linha padrão — hoje a única, porque nenhum emitente preenche `esp`. */
export const DEFAULT_CARGO_VOLUME_SPECIES = ''

function createClient() {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

/**
 * Spec 077: o fator de cubagem por espécie.
 *
 * ⚠️ **Desligar é apagar a linha**, nunca gravar zero — o CHECK do banco recusa zero, e zero diria
 * que a carga não ocupa espaço nenhum. As duas metades (tela e banco) dizem a mesma coisa.
 */
export function useCargoVolumeFactor(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const client = createClient()
  const queryKey = [CARGO_VOLUME_QUERY_KEY, input.companyId] as const

  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.getCargoVolumeFactors(),
    queryKey,
  })

  const save = useMutation({
    mutationFn: (volumePerUnitM3: string) =>
      client.saveCargoVolumeFactor({ species: DEFAULT_CARGO_VOLUME_SPECIES, volumePerUnitM3 }),
    onSuccess: (factors) => {
      queryClient.setQueryData(queryKey, factors)
    },
  })

  const clearCargoVolumeFactor = useMutation({
    mutationFn: () => client.clearCargoVolumeFactor(),
    /**
     * Sem `await`: aguardar o cache aqui segura o botao ate a releitura terminar, e
     * `test/shared/mutation-pending-state.contract.ts` reprova isso em varredura de fonte.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const factors: readonly CargoVolumeFactor[] = query.data ?? []
  const current = factors.find((factor) => factor.species === DEFAULT_CARGO_VOLUME_SPECIES) ?? null

  return {
    clear: clearCargoVolumeFactor,
    current,
    factors,
    isLoading: query.isLoading,
    save,
  }
}
