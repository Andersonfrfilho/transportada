/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  BUSINESS_CALENDAR_AUDIT_PERMISSION,
  HOLIDAY_IMPORT_CONFIGURE_PERMISSION,
} from '../domain/business-calendar-audit.constant.js'

/** A trilha registra a mesma permissão que a rota exigiu. */
export const BUSINESS_CALENDAR_MANAGE_POLICY = {
  permission: BUSINESS_CALENDAR_AUDIT_PERMISSION,
  scope: 'company',
} as const

/** O roteiro e a viagem consultam o feriado da cidade; escrever segue sendo `settings.manage`. */
export const BUSINESS_CALENDAR_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

/** Spec 262 D6: escrever a chave e o orçamento da instalação não sai de carona com `settings.manage`. */
export const HOLIDAY_IMPORT_CONFIGURE_POLICY = {
  permission: HOLIDAY_IMPORT_CONFIGURE_PERMISSION,
  scope: 'company',
} as const
