/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { nfePackageBoxes } from '../../src/database/nfe.schema.js'

const config = getTableConfig(nfePackageBoxes)
const columnNames = config.columns.map((column) => column.name)
const checkNames = config.checks.map((check) => check.name)

describe('a caixa de papelão e a medida dela (spec 085 G004)', () => {
  test('a tabela guarda a identidade, a medida e o alias global', () => {
    expect(config.name).toBe('nfe_package_boxes')
    expect(columnNames).toEqual([
      'id',
      'company_id',
      'emitter_tax_id',
      'product_code',
      'commercial_unit',
      'description',
      'units_per_box',
      'carton_gtin',
      'length_mm',
      'width_mm',
      'height_mm',
      'gross_weight_grams',
      'measured_at',
      'created_at',
      'updated_at',
    ])
  })

  /**
   * ⚠️ O `uCom` **faz parte da chave**: o mesmo produto em `CX12` e `CX24` são duas caixas
   * diferentes. Medido em 345 NF-e: `CX12` cobre 151 produtos distintos e `CX24` cobre 90 — o código
   * diz quantas unidades vão dentro, nunca o tamanho. Tirar `commercial_unit` daqui faria duas
   * caixas de tamanhos diferentes disputarem a mesma linha.
   */
  test('a identidade inclui a empresa, o emitente, o produto e a embalagem', () => {
    const identity = config.uniqueConstraints.find(
      (constraint) => constraint.name === 'nfe_package_boxes_identity_unique',
    )

    expect(identity?.columns.map((column) => column.name)).toEqual([
      'company_id',
      'emitter_tax_id',
      'product_code',
      'commercial_unit',
    ])
  })

  /** Medida pela metade não mede nada: sem as três, o m³ derivado seria invenção. */
  test('ou as três dimensões, ou nenhuma', () => {
    expect(checkNames).toContain('nfe_package_boxes_dimensions_together_check')
  })

  /** Dedo no teclado: caixa de 15 m entra silenciosa e estraga toda ocupação depois dela. */
  test('a faixa das medidas é conferida no banco', () => {
    expect(checkNames).toContain('nfe_package_boxes_dimensions_check')
  })

  /** A data de medição não é opcional em linha medida: sem ela ninguém sabe o que é antigo. */
  test('medida e data de medição andam juntas', () => {
    expect(checkNames).toContain('nfe_package_boxes_measured_at_check')
  })

  /**
   * ⚠️ Milímetro e grama **inteiros**, nunca decimal: medida em ponto flutuante acumula erro, pelo
   * mesmo motivo que dinheiro é centavo. E o m³ é **derivado** — não há coluna de volume, senão ela
   * discordaria das próprias dimensões na primeira edição.
   */
  test('a medida é inteira, e não há coluna de volume', () => {
    const measures = ['length_mm', 'width_mm', 'height_mm', 'gross_weight_grams']
    for (const name of measures) {
      expect(config.columns.find((column) => column.name === name)?.columnType).toBe('PgInteger')
    }
    expect(columnNames.some((name) => name.includes('volume') || name.includes('m3'))).toBe(false)
  })

  /** A fila de medição pergunta "o que falta nesta empresa" — e o índice parcial é para ela. */
  test('há índice para as pendentes e para o alias global', () => {
    const indexNames = config.indexes.map((index) => index.config.name)

    expect(indexNames).toContain('nfe_package_boxes_company_pending_idx')
    expect(indexNames).toContain('nfe_package_boxes_company_gtin_idx')
  })
})
