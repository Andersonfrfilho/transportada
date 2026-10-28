/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { whatsappEvolutionSettings } from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  foreignKeys,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('a configuração do Evolution no banco (spec 281 T4)', () => {
  test('é uma por empresa e ancora na empresa', () => {
    expect(
      uniqueColumnsByName(whatsappEvolutionSettings).whatsapp_evolution_settings_company_id_unique,
    ).toEqual(['company_id'])
    expect(foreignKeys(whatsappEvolutionSettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'whatsapp_evolution_settings_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('guarda o envelope, nunca a chave em claro', () => {
    const types = columnSqlTypes(whatsappEvolutionSettings)

    expect(types.secret_envelope).toBe('jsonb')
    expect(Object.keys(types)).not.toContain('api_key')
    expect(Object.keys(types)).not.toContain('key')
  })

  test('o banco recusa ligar sem o aviso de risco e valores fora dos limites', () => {
    const checks = unqualifiedCheckSqlByName(whatsappEvolutionSettings)

    expect(checks.whatsapp_evolution_settings_active_requires_risk_ack_check).toContain(
      'risk_acknowledged_at',
    )
    expect(checks.whatsapp_evolution_settings_daily_cap_check).toContain('between 1 and 1000')
    expect(checks.whatsapp_evolution_settings_min_interval_check).toContain('between 1 and 3600')
    expect(checks.whatsapp_evolution_settings_instance_name_check).toContain('A-Za-z0-9_-')
  })
})
