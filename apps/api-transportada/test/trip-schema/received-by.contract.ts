/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
  RECEIVED_BY_OPTIONS,
  RECEIVED_BY_OPTIONS_REQUIRING_DETAIL,
  tripDeliveryProofs,
} from '../../src/database/database.schema.js'
import { columnSqlTypes, unqualifiedCheckSqlByName } from '../fiscal-schema/support.js'

/**
 * Spec 193 D1/D3/D4 (ADR-0079 Parte A): quem recebeu é coluna do comprovante, com a relação numa
 * lista fechada (VARCHAR + CHECK, nunca ENUM) e um detalhe curto. Vale para `photo` e `signature`,
 * nunca para `cargo` — e a foto do motorista passa a carregar o nome.
 */
describe('quem recebeu no comprovante (spec 193 D1, D3, D4)', () => {
  test('a relação tem os dez códigos, na ordem da D1', () => {
    expect([...RECEIVED_BY_OPTIONS]).toEqual([
      'recipient',
      'spouse',
      'child',
      'parent',
      'sibling',
      'other_relative',
      'neighbor',
      'doorman',
      'employee',
      'other',
    ])
  })

  test('só "outro familiar" e "outro" pedem detalhe', () => {
    expect([...RECEIVED_BY_OPTIONS_REQUIRING_DETAIL]).toEqual(['other_relative', 'other'])
  })

  test('as duas colunas existem, anuláveis, com o tamanho da D1', () => {
    const { columns } = getTableConfig(tripDeliveryProofs)
    const receivedBy = columns.find((column) => column.name === 'received_by')
    const receivedByDetail = columns.find((column) => column.name === 'received_by_detail')

    expect(columnSqlTypes(tripDeliveryProofs).received_by).toBe('varchar(16)')
    expect(columnSqlTypes(tripDeliveryProofs).received_by_detail).toBe('varchar(120)')
    expect(receivedBy?.notNull).toBe(false)
    expect(receivedByDetail?.notNull).toBe(false)
  })

  test('a relação está na lista ou é nula', () => {
    const checkSql =
      unqualifiedCheckSqlByName(tripDeliveryProofs).trip_delivery_proofs_received_by_check

    expect(checkSql).toContain('"received_by" is null')
    for (const option of RECEIVED_BY_OPTIONS) expect(checkSql).toContain(`'${option}'`)
  })

  test('o detalhe só existe com relação', () => {
    expect(
      unqualifiedCheckSqlByName(tripDeliveryProofs).trip_delivery_proofs_received_by_detail_check,
    ).toBe('"received_by_detail" is null or "received_by" is not null')
  })

  test('a foto da carga nunca leva quem recebeu', () => {
    expect(
      unqualifiedCheckSqlByName(tripDeliveryProofs).trip_delivery_proofs_received_by_kind_check,
    ).toBe(`"kind" <> 'cargo' or ("received_by" is null and "received_by_detail" is null)`)
  })

  test('o nome deixa de depender do canal: qualquer tipo menos cargo (D4)', () => {
    expect(unqualifiedCheckSqlByName(tripDeliveryProofs).trip_delivery_proofs_receiver_check).toBe(
      `"kind" <> 'cargo' or length("receiver_name") = 0`,
    )
  })

  test('o detalhe obrigatório em other/other_relative não vira CHECK (D2: o motorista grava sem)', () => {
    const checks = Object.values(unqualifiedCheckSqlByName(tripDeliveryProofs))

    expect(
      checks.some(
        (checkSql) =>
          checkSql.includes("'other_relative'") && checkSql.includes('received_by_detail'),
      ),
    ).toBe(false)
  })
})

/** Spec 193 D6: o quinto campo da configuração, nas duas tabelas, com `optional` de fábrica. */
describe('quem recebeu na configuração do comprovante (spec 193 D6)', () => {
  test.each([
    ['company_delivery_proof_settings', companyDeliveryProofSettings],
    ['delivery_proof_setting_overrides', deliveryProofSettingOverrides],
  ] as const)('%s ganha received_by optional, obrigatório e checado', (tableName, table) => {
    const column = getTableConfig(table).columns.find((item) => item.name === 'received_by')

    expect(column?.notNull).toBe(true)
    expect(column?.default).toBe('optional')
    expect(unqualifiedCheckSqlByName(table)[`${tableName}_received_by_check`]).toBe(
      `"received_by" in ('required', 'optional', 'off')`,
    )
  })
})
