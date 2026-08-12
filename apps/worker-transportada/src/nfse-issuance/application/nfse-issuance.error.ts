/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A mensagem destes erros vira motivo de dead-letter e de retry: ela carrega vocabulário fechado
 * (`transport_failure`, `rejected`, …), nunca o texto da prefeitura nem dado do tomador.
 */
export class NfseIssuanceRecoverableError extends Error {
  override readonly name = 'NfseIssuanceRecoverableError'
}

export class NfseIssuanceFatalError extends Error {
  override readonly name = 'NfseIssuanceFatalError'
}
