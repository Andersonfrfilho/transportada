/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: the markers that let the scenario seeder find, and only find, what it created.
 */
export const SCENARIO_PREFIX = '[TESTE 248]'
export const SCENARIO_BUCKET = 'teste-248'
export const SCENARIO_IMPORT_KEY_PREFIX = 'teste-248-'
export const SCENARIO_CONTRACTOR_TAX_ID = '11444777000161'
export const SCENARIO_MAIL_DOMAIN = 'teste248.example.test'
export const SCENARIO_PLATE_PREFIX = 'TST'

export const REPLY_MODE = {
  afterApproval: 'forward_after_approval',
  automatic: 'forward_automatic',
} as const

export const CONTENT_TYPE = {
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
} as const

export const DRIVER_REPLY_TEXT = 'Segue o boleto prorrogado.'
export const WAIT_HOURS = 6
export const ALERT_INTERVAL_MINUTES = 60
export const ALERT_MAX_COUNT = 24
