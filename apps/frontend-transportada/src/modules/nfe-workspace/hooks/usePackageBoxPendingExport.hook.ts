/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createPackageBoxClient } from '../shared/packageBoxClient.service'
import {
  isPackageBoxPendingExportTruncated,
  PACKAGE_BOX_PENDING_EXPORT_LIMIT,
} from '../shared/packageBoxPendingExport.service'

const PACKAGE_BOX_PENDING_EXPORT_QUERY_KEY = 'nfe-package-boxes-pending-export'

function createClient() {
  return createPackageBoxClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * A lista para exportar é sempre "tudo o que falta medir" — nunca a busca/etiqueta da fila
 * interativa (`usePackageBoxQueue`), que existe para medir uma caixa de cada vez. Consulta própria,
 * com o teto documentado da API (`PACKAGE_BOX_PENDING_EXPORT_LIMIT`).
 */
export function usePackageBoxPendingExport(
  input: Readonly<{ companyId?: string; enabled: boolean }>,
) {
  const client = createClient()

  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => client.listBoxes({ limit: PACKAGE_BOX_PENDING_EXPORT_LIMIT, status: 'pending' }),
    queryKey: [PACKAGE_BOX_PENDING_EXPORT_QUERY_KEY, input.companyId] as const,
  })

  return {
    boxes: query.data?.items ?? [],
    failed: query.isError,
    isTruncated: isPackageBoxPendingExportTruncated(query.data?.items.length ?? 0),
    loading: query.isLoading,
  }
}

export type PackageBoxPendingExportController = ReturnType<typeof usePackageBoxPendingExport>
