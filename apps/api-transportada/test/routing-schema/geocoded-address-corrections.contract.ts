/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CORRECTION_ORIGINS,
  GEOCODING_PRECISIONS,
  GEOCODING_SOURCES,
  geocodedAddressCorrections,
  geocodedAddresses,
  geocodingRefinementRequests,
} from '../../src/database/database.schema.js'
import { readFileSync } from 'node:fs'

import { checkSqlByName, columnNames, requiredColumnNames } from '../fiscal-schema/support.js'

const MIGRATION = readFileSync(
  new URL(
    '../../drizzle/20260904120000_geocoded_address_corrections/migration.sql',
    import.meta.url,
  ),
  'utf8',
).toLowerCase()

describe('correção humana de coordenada (spec 084, RF4)', () => {
  test('guarda a posição anterior e a nova, com procedência dos dois lados', () => {
    expect(columnNames(geocodedAddressCorrections)).toEqual([
      'id',
      'company_id',
      'address_key',
      'previous_latitude',
      'previous_longitude',
      'previous_source',
      'previous_precision',
      'new_latitude',
      'new_longitude',
      'new_source',
      'new_precision',
      'origin',
      'actor_user_id',
      'requested_by',
      'reason',
      'created_at',
    ])
  })

  /**
   * ⚠️ O deslocamento em metros que o relatório pede (RF7) **não é coluna** — sai da diferença entre
   * as duas posições. Guardar o derivado abriria a porta para ele discordar das pontas que o
   * geraram, e o relatório passaria a mentir sem nada falhar.
   */
  test('não guarda o deslocamento: ele é derivado das duas posições', () => {
    expect(columnNames(geocodedAddressCorrections)).not.toContain('distance_metres')
    expect(columnNames(geocodedAddressCorrections)).not.toContain('displacement_metres')
  })

  /**
   * ⚠️ As quatro colunas da posição anterior vivem e morrem juntas. Coordenada sem procedência é
   * coordenada em que ninguém confia; procedência sem coordenada não diz de onde se saiu.
   */
  test('a posição anterior é tudo ou nada', () => {
    const check =
      checkSqlByName(geocodedAddressCorrections)['geocoded_address_corrections_previous_check'] ??
      ''

    /** ⚠️ A semântica, não só os nomes: um `<>` ou um `or` no lugar do `=`/`and` passaria despercebido. */
    expect(check.match(/is null\) = \(/gu) ?? []).toHaveLength(3)
    expect(check).toContain('previous_longitude')
    expect(check).toContain('previous_source')
    expect(check).toContain('previous_precision')
    expect(check).not.toContain(' or ')
  })

  /** A correção nova é obrigatória inteira: não existe corrigir sem dizer para onde. */
  test('exige a posição nova completa', () => {
    const required = requiredColumnNames(geocodedAddressCorrections)

    expect(required).toContain('new_latitude')
    expect(required).toContain('new_longitude')
    expect(required).toContain('new_source')
    expect(required).toContain('new_precision')
    expect(required).toContain('origin')
    expect(required).toContain('actor_user_id')
  })

  /**
   * ⚠️ **Eixo separado de `source`.** Contratante, motorista e operador produzem todos
   * `source = 'manual'` na coordenada — sem `origin` o relatório não consegue responder de quem vem
   * a informação boa, que é o número que decide se vale continuar pagando provedor.
   */
  test('a origem da correção é eixo próprio, não se confunde com a fonte da coordenada', () => {
    expect([...CORRECTION_ORIGINS]).toEqual(['contractor', 'driver', 'operator'])
    for (const origin of CORRECTION_ORIGINS) {
      expect([...GEOCODING_SOURCES]).not.toContain(origin as never)
    }
  })

  test('amarra origem, fonte e precisão aos catálogos', () => {
    const checks = checkSqlByName(geocodedAddressCorrections)
    for (const origin of CORRECTION_ORIGINS) {
      expect(checks['geocoded_address_corrections_origin_check'] ?? '').toContain(origin)
    }
    for (const source of GEOCODING_SOURCES) {
      expect(checks['geocoded_address_corrections_new_source_check'] ?? '').toContain(source)
    }
    for (const precision of GEOCODING_PRECISIONS) {
      expect(checks['geocoded_address_corrections_new_precision_check'] ?? '').toContain(precision)
    }
  })

  /**
   * ⚠️ **`company_id`, ao contrário de `geocoded_addresses`.** A coordenada de um endereço não é de
   * ninguém — é a mesma rua para quem quer que entregue nela. A **correção** é de quem a fez: ela
   * carrega a decisão e o ator, e é por empresa que o relatório agrupa.
   */
  test('a correção tem dono, a coordenada não', () => {
    expect(columnNames(geocodedAddressCorrections)).toContain('company_id')
    expect(columnNames(geocodedAddresses)).not.toContain('company_id')
  })

  /**
   * ⚠️ **Não é `geocoding_refinement_requests`, e a diferença não é cosmética.** Aquela registra a
   * *compra* de precisão fina no provedor pago (spec 069) e alimenta o teto de gasto por janela;
   * esta registra a correção *por gente*, que não custa nada. Fundi-las faria o teto contar
   * correção gratuita e cortar o gasto cedo demais — e é por isso que a de compra não guarda
   * posição, e esta guarda.
   */
  test('não duplica a trilha de compra de precisão', () => {
    expect(columnNames(geocodingRefinementRequests)).not.toContain('new_latitude')
    expect(columnNames(geocodedAddressCorrections)).not.toContain('outcome')
  })

  /**
   * ⚠️ **Neste repositório append-only é um trigger, não um comentário.** `delivery_address_overrides`,
   * `audit_logs` e `trip_dispatch_snapshots` todos têm `reject_*_mutation`, e é isso que a palavra
   * significa aqui. Sem ele, um `UPDATE` de "correção de bug" apaga a única prova de que o relatório
   * depende — e nada falha. Achado por revisão de arquitetura.
   */
  test('a trilha é imutável no banco, não só na disciplina', () => {
    expect(MIGRATION).toMatch(
      /create trigger reject_geocoded_address_corrections_mutation[\s\S]*before update or delete/u,
    )
    expect(MIGRATION).toContain('raise exception')
  })
})
