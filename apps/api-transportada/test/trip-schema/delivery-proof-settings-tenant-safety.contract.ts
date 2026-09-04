/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

/**
 * Spec 082 T010 / ADR-0057: a configuração do comprovante é por empresa, e a exceção por CNPJ do
 * destinatário também. Uma linha sem tenant aqui faria o formulário de uma transportadora obedecer
 * à configuração de outra.
 */
describe('delivery proof settings tenant safety (spec 082)', () => {
  test('anchors the general settings to the company', () => {
    expect(foreignKeys(companyDeliveryProofSettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_delivery_proof_settings_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('anchors every override to the company', () => {
    expect(foreignKeys(deliveryProofSettingOverrides)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'delivery_proof_setting_overrides_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** O CNPJ do destinatário é único **dentro** da empresa — nunca global. */
  test('keeps the override unique per company and recipient, never globally', () => {
    const { uniqueConstraints } = getTableConfig(deliveryProofSettingOverrides)

    expect(
      uniqueConstraints.map((constraint) => ({
        columns: constraint.columns.map((column) => column.name).sort(),
        name: constraint.name,
      })),
    ).toContainEqual({
      columns: ['company_id', 'tax_id'],
      name: 'delivery_proof_setting_overrides_company_tax_id_unique',
    })
  })

  /** ADR-0057 §4: instalação nova nasce sem colher documento — `off` é o padrão de fábrica. */
  test('ships receiver document off by factory default', () => {
    const { columns } = getTableConfig(companyDeliveryProofSettings)
    const receiverDocument = columns.find((column) => column.name === 'receiver_document')

    expect(receiverDocument?.default).toBe('off')
  })
})
