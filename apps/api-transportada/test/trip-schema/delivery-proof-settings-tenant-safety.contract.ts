/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingContractorOverrides,
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

  /**
   * Spec 193 D6: o modo de "quem recebeu" mora na linha do tenant (geral) e na exceção por CNPJ
   * dentro dele — nunca numa tabela à parte, sem `company_id`.
   */
  test('keeps the received-by mode on the tenant rows', () => {
    for (const table of [companyDeliveryProofSettings, deliveryProofSettingOverrides]) {
      const receivedBy = getTableConfig(table).columns.find(
        (column) => column.name === 'received_by',
      )
      expect(receivedBy?.default).toBe('optional')
    }
  })

  /** ADR-0057 §4: instalação nova nasce sem colher documento — `off` é o padrão de fábrica. */
  test('ships receiver document off by factory default', () => {
    const { columns } = getTableConfig(companyDeliveryProofSettings)
    const receiverDocument = columns.find((column) => column.name === 'receiver_document')

    expect(receiverDocument?.default).toBe('off')
  })
})

/**
 * Spec 218 RF-C1: a exceção por contratante é a mesma forma da exceção por destinatário, trocando
 * `tax_id` livre por `contractor_id uuid` com FK composta para `contractors`.
 */
describe('delivery proof contractor overrides tenant safety (spec 218)', () => {
  test('anchors every contractor override to the company', () => {
    expect(foreignKeys(deliveryProofSettingContractorOverrides)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'delivery_proof_setting_contractor_overrides_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** A FK é composta com o tenant — nunca só `contractor_id`, senão o contratante de outra empresa colaria. */
  test('anchors the contractor reference to the company, not only the id', () => {
    expect(foreignKeys(deliveryProofSettingContractorOverrides)).toContainEqual({
      columns: ['company_id', 'contractor_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractors',
      name: 'delivery_proof_setting_contractor_overrides_company_id_contractor_id_contractors_company_id_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** O contratante é único **dentro** da empresa — nunca global. */
  test('keeps the override unique per company and contractor, never globally', () => {
    const { uniqueConstraints } = getTableConfig(deliveryProofSettingContractorOverrides)

    expect(
      uniqueConstraints.map((constraint) => ({
        columns: constraint.columns.map((column) => column.name).sort(),
        name: constraint.name,
      })),
    ).toContainEqual({
      columns: ['company_id', 'contractor_id'],
      name: 'delivery_proof_setting_contractor_overrides_company_contractor_unique',
    })
  })
})

/** Spec 218 RF-C2: a exceção por destinatário ganha FK de verdade — hoje era só CHECK de formato. */
describe('delivery proof recipient override gains a real FK (spec 218 RF-C2)', () => {
  test('anchors the recipient tax id to delivery_clients, composite with the company', () => {
    expect(foreignKeys(deliveryProofSettingOverrides)).toContainEqual({
      columns: ['company_id', 'tax_id'],
      foreignColumns: ['company_id', 'tax_id'],
      foreignTable: 'delivery_clients',
      name: 'delivery_proof_setting_overrides_company_id_tax_id_delivery_clients_company_id_tax_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
