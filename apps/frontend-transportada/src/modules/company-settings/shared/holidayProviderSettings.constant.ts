/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Os caminhos da chave da FeriadosAPI (instalação) e do liga/desliga da importação (empresa) — spec 262, ADR-0102 D2. */
export const HOLIDAY_PROVIDER_SETTINGS_PATH = {
  ENABLEMENT: '/company-settings/holiday-import',
  SETTINGS: '/holiday-imports/provider-settings',
  TOKEN: '/holiday-imports/provider-settings/token',
} as const

/** Escrever a chave exige esta permissão além de `settings.manage` (a aba só aparece com a segunda). */
export const HOLIDAY_IMPORT_CONFIGURE_PERMISSION = 'holiday-import.configure'

/** As mesmas regras da API: 16 a 512 caracteres ASCII visíveis, sem espaço, acento nem controle. */
export const HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH = 16
export const HOLIDAY_PROVIDER_TOKEN_MAX_LENGTH = 512
export const HOLIDAY_PROVIDER_TOKEN_PATTERN = /^[\x21-\x7E]{16,512}$/u

export const HOLIDAY_PROVIDER_BUDGET_MIN = 1
export const HOLIDAY_PROVIDER_BUDGET_MAX = 1_000_000

/** `default`: ninguém definiu o orçamento e vale o padrão da instalação; `installation`: o administrador o definiu. */
export const HOLIDAY_PROVIDER_BUDGET_ORIGINS = ['default', 'installation'] as const

/** `default`: a empresa nunca tocou no interruptor (a importação vem ligada); `company`: a empresa decidiu. */
export const HOLIDAY_ENABLEMENT_ORIGINS = ['company', 'default'] as const

/** Dois administradores salvaram ao mesmo tempo (409): a configuração é relida e o segundo decide de novo. */
export const HOLIDAY_PROVIDER_VERSION_CONFLICT_CODE = 'HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT'

/** Os nomes de campo que a API usa nos `details` do 400: o foco volta ao campo com o mesmo atributo `data-field`. */
export const HOLIDAY_PROVIDER_FIELD = {
  BUDGET: 'monthlyRequestBudget',
  TOKEN: 'token',
} as const
