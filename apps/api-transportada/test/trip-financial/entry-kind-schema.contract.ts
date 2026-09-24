/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 RF1: a espécie de lançamento é cadastro da empresa — CA01, CA03, CA06.
 */
import { describe, expect, test } from 'bun:test'

import {
  companyEntryKinds,
  tripCostEntries,
  tripRevenueEntries,
} from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  foreignKeys,
  indexColumnsByName,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('a espécie de lançamento é cadastro da empresa (spec 169 RF1)', () => {
  test('side só aceita gasto ou receita — os dois nunca compartilham a lista (CA03)', () => {
    expect(unqualifiedCheckSqlByName(companyEntryKinds).company_entry_kinds_side_check).toBe(
      `"side" in ('expense', 'revenue')`,
    )
  })

  /** CA06: nome repetido no mesmo lado é recusado — a unicidade é (empresa, lado, nome). */
  test('nome único por empresa e por lado', () => {
    expect(
      uniqueColumnsByName(companyEntryKinds).company_entry_kinds_company_side_name_unique,
    ).toEqual(['company_id', 'side', 'name'])
  })

  test('o seletor lê só as ativas do lado certo pelo índice (company_id, side)', () => {
    expect(indexColumnsByName(companyEntryKinds).company_entry_kinds_company_side_idx).toEqual([
      'company_id',
      'side',
    ])
  })
})

describe('a receita lançada na viagem (spec 169 P1/RF3/RF4)', () => {
  test('o valor é numeric(19, 4), como todo dinheiro desta base', () => {
    expect(columnSqlTypes(tripRevenueEntries).amount).toBe('numeric(19, 4)')
  })

  test('valor maior que zero, como o gasto', () => {
    expect(unqualifiedCheckSqlByName(tripRevenueEntries).trip_revenue_entries_amount_check).toBe(
      '"amount" > 0',
    )
  })

  test('a receita alcança a viagem pelo tenant, nunca por id sozinho', () => {
    expect(foreignKeys(tripRevenueEntries)).toContainEqual({
      columns: ['company_id', 'trip_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trips',
      name: 'trip_revenue_entries_company_trip_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** A espécie em uso não é apagada (RF6): a FK aponta para o cadastro, não para um enum solto. */
  test('a espécie do lançamento é a mesma tabela do cadastro, por empresa', () => {
    expect(foreignKeys(tripRevenueEntries)).toContainEqual({
      columns: ['company_id', 'entry_kind_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'company_entry_kinds',
      name: 'trip_revenue_entries_entry_kind_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** RF13: removido não volta a aparecer — a trilha exige as duas colunas juntas ou nenhuma. */
  test('remover é trilha inteira, nunca pela metade', () => {
    expect(unqualifiedCheckSqlByName(tripRevenueEntries).trip_revenue_entries_removed_check).toBe(
      '("removed_at" is null) = ("removed_by_user_id" is null)',
    )
  })
})

describe('o gasto migra para o cadastro de espécies (spec 169 RF5)', () => {
  test('o seletor novo lê a mesma tabela do cadastro, por empresa', () => {
    expect(foreignKeys(tripCostEntries)).toContainEqual({
      columns: ['company_id', 'entry_kind_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'company_entry_kinds',
      name: 'trip_cost_entries_entry_kind_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** RF12/RF13: mesma trilha da receita — remover não apaga, e as duas colunas andam juntas. */
  test('remover é trilha inteira, nunca pela metade', () => {
    expect(unqualifiedCheckSqlByName(tripCostEntries).trip_cost_entries_removed_check).toBe(
      '("removed_at" is null) = ("removed_by_user_id" is null)',
    )
  })
})
