/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/business-calendar/domain/holiday-provider-settings.constant.ts`
 * (spec 262, ADR-0102 D5): o AAD e a regra da chave têm de ser idênticos aos da API, que sela. A paridade é
 * cobrada por `test/holiday-provider-pull/token-secret-parity.contract.ts`.
 */

/** Visível ASCII (sem espaço), de 16 a 512 caracteres: o mesmo alfabeto que o worker exigia da variável. */
export const HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH = 16
export const HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH = 512
export const HOLIDAY_PROVIDER_TOKEN_PATTERN = new RegExp(
  `^[\\x21-\\x7E]{${HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH},${HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH}}$`,
  'u',
)

export const HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX = 'transportada:holiday-provider-token:v1:'
