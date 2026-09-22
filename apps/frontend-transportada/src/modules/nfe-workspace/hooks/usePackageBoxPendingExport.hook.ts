/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createPackageBoxClient,
  type PackageBox,
  type PackageBoxPendingExport,
} from '../shared/packageBoxClient.service'
import {
  resolvePackageBoxPendingExportFeedback,
  type PackageBoxPendingExportFormat,
} from '../shared/packageBoxPendingExport.service'

function loadPendingExportFromApi(): Promise<PackageBoxPendingExport> {
  return createPackageBoxClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  }).listPendingExport()
}

/**
 * A lista para exportar é sempre "tudo o que falta medir" — nunca a busca/etiqueta da fila
 * interativa (`usePackageBoxQueue`). ⚠️ **Busca só no clique**, nunca ao abrir a aba: a rota tem teto
 * de 10 pedidos a cada 5 min por usuário e devolve a empresa inteira, então consulta automática
 * (abertura, foco da janela, `staleTime`) gastava o teto e baixava megabytes que ninguém pediu — e
 * ainda entregava o arquivo de antes da última medida.
 *
 * `loadPendingExport` existe para o teste de hook trocar a rede por um falso.
 */
export function usePackageBoxPendingExport(
  input: Readonly<{ loadPendingExport?: () => Promise<PackageBoxPendingExport> }> = {},
) {
  const loadPendingExport = input.loadPendingExport ?? loadPendingExportFromApi
  // O formato só vai como variável da mutação: é ele que diz qual botão mostra "Preparando…".
  const mutation = useMutation<PackageBoxPendingExport, Error, PackageBoxPendingExportFormat>({
    mutationFn: () => loadPendingExport(),
  })

  return {
    feedback: resolvePackageBoxPendingExportFeedback({
      error: mutation.error,
      isPending: mutation.isPending,
      result: mutation.data,
    }),
    preparingFormat: mutation.isPending ? mutation.variables : undefined,
    /** As caixas para o arquivo, ou `undefined` quando não há o que baixar (falha, 429, vazio). */
    async prepare(
      format: PackageBoxPendingExportFormat,
    ): Promise<readonly PackageBox[] | undefined> {
      // A falha já fica em `mutation.error` e vira aviso na tela: aqui só não há arquivo.
      const result = await mutation.mutateAsync(format).catch(() => undefined)
      return result === undefined || result.items.length === 0 ? undefined : result.items
    },
  }
}

export type PackageBoxPendingExportController = ReturnType<typeof usePackageBoxPendingExport>
