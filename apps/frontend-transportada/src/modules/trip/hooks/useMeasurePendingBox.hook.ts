/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  createPackageBoxClient,
  packageBoxErrorCode,
  type PackageBoxMeasurementInput,
} from '@/modules/nfe-workspace/shared/packageBoxClient.service'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

export { packageBoxErrorCode }

function createClient() {
  return createPackageBoxClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Spec 168 (RF03): grava a medida direto na linha do que falta medir — o mesmo `PUT` e o mesmo caso
 * de uso da fila de medição (`nfe-workspace`), nunca uma segunda escrita própria. A invalidação de
 * `packageBoxMeasurement` já inclui `trip-cargo-layout`/`trip-cargo-preview` (`mutationInvalidation
 * .service.ts`), então a linha some e a cubagem se refaz sozinha, pela resposta da releitura.
 */
export function useMeasurePendingBox() {
  const queryClient = useQueryClient()
  const client = createClient()

  return useMutation({
    mutationFn: (measurement: PackageBoxMeasurementInput) => client.measureBox(measurement),
    onSuccess: () =>
      invalidateMutationEffect({ effect: MUTATION_EFFECT.packageBoxMeasurement, queryClient }),
  })
}
