/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 (ADR-0102): o vocabulário da chave da FeriadosAPI guardada no banco. ⚠️ O AAD e a regra da chave são
 * cópia por valor no worker (`holiday-provider-token-secret.service.ts` de lá), com contrato de paridade.
 */

/** Visível ASCII (sem espaço), de 16 a 512 caracteres: o mesmo alfabeto que o worker exigia da variável. */
export const HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH = 16
export const HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH = 512
export const HOLIDAY_PROVIDER_TOKEN_PATTERN = new RegExp(
  `^[\\x21-\\x7E]{${HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH},${HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH}}$`,
  'u',
)

/** A mesma regra dita em texto, para o `400` e o detalhe do erro: o campo e a regra, nunca o valor. */
export const HOLIDAY_PROVIDER_TOKEN_RULE_MESSAGE = `Must be ${HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH} to ${HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH} visible ASCII characters`

/** Os 4 últimos caracteres da chave, em claro, só para a tela dizer "…1234". */
export const HOLIDAY_PROVIDER_TOKEN_HINT_LENGTH = 4

export const HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX = 'transportada:holiday-provider-token:v1:'

export const HOLIDAY_PROVIDER_SETTINGS_ERROR_CODE = {
  HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT: 'HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT',
  HOLIDAY_PROVIDER_TOKEN_INVALID: 'HOLIDAY_PROVIDER_TOKEN_INVALID',
  HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE: 'HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE',
} as const
