/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T6.1b (revisão final): a trilha de auditoria grava a permissão que a rota exigiu, e as duas permissões do
 * calendário saem das constantes do domínio. Elas têm de ser membros reais de `TRANSPORTADA_PERMISSIONS` (no tipo, pelo
 * `satisfies`; aqui, em tempo de execução), e a rota da chave tem de exigir exatamente a que a trilha registra.
 */
import { describe, expect, test } from 'bun:test'

import {
  BUSINESS_CALENDAR_AUDIT_PERMISSION,
  HOLIDAY_IMPORT_CONFIGURE_PERMISSION,
} from '../../src/business-calendar/domain/business-calendar-audit.constant.js'
import {
  BUSINESS_CALENDAR_MANAGE_POLICY,
  HOLIDAY_IMPORT_CONFIGURE_POLICY,
} from '../../src/business-calendar/presentation/business-calendar-policy.constant.js'
import { TRANSPORTADA_PERMISSIONS } from '../../src/identity/domain/authorization.policy.js'

describe('permissões da trilha do calendário (spec 262 T6.1b)', () => {
  test.each([
    ['settings.manage', BUSINESS_CALENDAR_AUDIT_PERMISSION],
    ['holiday-import.configure', HOLIDAY_IMPORT_CONFIGURE_PERMISSION],
  ])(
    '"%s" é uma permissão do catálogo da API, e a constante da trilha a repete sem desvio',
    (name, constant) => {
      expect<readonly string[]>(TRANSPORTADA_PERMISSIONS).toContain(name)
      expect(constant).toBe(name)
    },
  )

  test('as políticas das rotas exigem a mesma permissão que a trilha registra', () => {
    expect(BUSINESS_CALENDAR_MANAGE_POLICY.permission).toBe(BUSINESS_CALENDAR_AUDIT_PERMISSION)
    expect(HOLIDAY_IMPORT_CONFIGURE_POLICY.permission).toBe(HOLIDAY_IMPORT_CONFIGURE_PERMISSION)
  })
})
