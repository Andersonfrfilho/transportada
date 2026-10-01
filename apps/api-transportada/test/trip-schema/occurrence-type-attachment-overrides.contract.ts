/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B1: as duas tabelas de exceção do `attachmentMode` de ocorrência (contratante e
 * destinatário) nascem ancoradas ao tenant — a mesma forma das irmãs de comprovante (spec 082/218).
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
} from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

describe('exceção de attachmentMode por tipo de ocorrência, por contratante (spec 218 RF-B1)', () => {
  test('ancora a exceção à empresa', () => {
    expect(foreignKeys(companyOccurrenceTypeContractorOverrides)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_occurrence_type_contractor_overrides_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** A exceção não sobrevive ao tipo: apagar o tipo apaga a exceção junto. */
  test('a exceção some quando o tipo some (cascade)', () => {
    expect(foreignKeys(companyOccurrenceTypeContractorOverrides)).toContainEqual({
      columns: ['company_id', 'occurrence_type_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'company_occurrence_types',
      name: 'company_occurrence_type_contractor_overrides_company_id_occurrence_type_id_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  test('ancora o contratante à empresa, nunca só pelo id', () => {
    expect(foreignKeys(companyOccurrenceTypeContractorOverrides)).toContainEqual({
      columns: ['company_id', 'contractor_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractors',
      name: 'company_occurrence_type_contractor_overrides_company_id_contractor_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('um contratante só tem uma exceção por tipo, dentro da empresa', () => {
    const { uniqueConstraints } = getTableConfig(companyOccurrenceTypeContractorOverrides)

    expect(
      uniqueConstraints.map((constraint) => ({
        columns: constraint.columns.map((column) => column.name).sort(),
        name: constraint.name,
      })),
    ).toContainEqual({
      columns: ['company_id', 'contractor_id', 'occurrence_type_id'].sort(),
      name: 'company_occurrence_type_contractor_overrides_type_contractor_unique',
    })
  })
})

describe('exceção de attachmentMode por tipo de ocorrência, por destinatário (spec 218 RF-B1)', () => {
  test('ancora a exceção à empresa', () => {
    expect(foreignKeys(companyOccurrenceTypeRecipientOverrides)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_occurrence_type_recipient_overrides_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('a exceção some quando o tipo some (cascade)', () => {
    expect(foreignKeys(companyOccurrenceTypeRecipientOverrides)).toContainEqual({
      columns: ['company_id', 'occurrence_type_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'company_occurrence_types',
      name: 'company_occurrence_type_recipient_overrides_company_id_occurrence_type_id_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  /** Mesma forma canônica de CPF/CNPJ da tabela irmã de comprovante (spec 218 RF-C2). */
  test('ancora o destinatário à empresa, pela mesma chave de delivery_clients', () => {
    expect(foreignKeys(companyOccurrenceTypeRecipientOverrides)).toContainEqual({
      columns: ['company_id', 'tax_id'],
      foreignColumns: ['company_id', 'tax_id'],
      foreignTable: 'delivery_clients',
      name: 'company_occurrence_type_recipient_overrides_company_id_tax_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('um destinatário só tem uma exceção por tipo, dentro da empresa', () => {
    const { uniqueConstraints } = getTableConfig(companyOccurrenceTypeRecipientOverrides)

    expect(
      uniqueConstraints.map((constraint) => ({
        columns: constraint.columns.map((column) => column.name).sort(),
        name: constraint.name,
      })),
    ).toContainEqual({
      columns: ['company_id', 'occurrence_type_id', 'tax_id'].sort(),
      name: 'company_occurrence_type_recipient_overrides_type_tax_id_unique',
    })
  })
})
