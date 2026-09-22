/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 160, RF05 — sanidade obrigatória antes de qualquer gravação de medida de catálogo. CA01 e
 * CA01b são o contrato: o payload real do Cosmos (fixture) nunca vira medida gravada.
 */
import { describe, expect, test } from 'bun:test'

import {
  BATATA_PALHA_CANDIDATE_AS_PROVIDED,
  BATATA_PALHA_CANDIDATE_REINTERPRETED_MM,
  BATATA_PALHA_CONTENT,
  BATATA_PALHA_CONTENT_WITHOUT_DENSITY_RANGE,
  GENERIC_DENSITY_RANGE_CONTENT,
  TIXAN_CANDIDATE,
  TIXAN_CONTENT,
} from '../fixtures/gtin-catalog.fixture.js'
import {
  EDGE_MAX_MM,
  EDGE_MIN_MM,
  evaluatePackageBoxCatalogSanity,
  type PackageBoxCatalogCandidate,
  type PackageBoxCatalogContentReference,
} from '../../src/nfe-documents/domain/package-box-catalog-sanity.policy.js'

describe('evaluatePackageBoxCatalogSanity (spec 160, RF05)', () => {
  test('CA01: o Cosmos torto do Tixan é rejeitado por EDGE_TOO_LARGE e GROSS_WEIGHT_BELOW_CONTENT, nada é gravado', () => {
    const result = evaluatePackageBoxCatalogSanity(TIXAN_CANDIDATE, TIXAN_CONTENT)

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).toContain('EDGE_TOO_LARGE')
    expect(result.reasons).toContain('GROSS_WEIGHT_BELOW_CONTENT')
  })

  test('CA01b: o Cosmos torto da batata palha é rejeitado por EDGE_TOO_LARGE e GROSS_WEIGHT_BELOW_CONTENT', () => {
    const result = evaluatePackageBoxCatalogSanity(
      BATATA_PALHA_CANDIDATE_AS_PROVIDED,
      BATATA_PALHA_CONTENT,
    )

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).toContain('EDGE_TOO_LARGE')
    expect(result.reasons).toContain('GROSS_WEIGHT_BELOW_CONTENT')
  })

  /**
   * CA01b, a segunda frente: mesmo reinterpretando o número do provedor como se já estivesse em
   * milímetro (36,5 × 22,0 × 25,6 cm = 20,6 L), a caixa não comporta 20 × 500 g de batata palha —
   * a densidade solta da categoria (100–150 kg/m³) precisa de 60–100 L. É o teste que prova que uma
   * faixa de densidade única (genérica) deixaria passar o que a faixa por NCM rejeita.
   */
  test('CA01b: reinterpretado em milímetro, continua rejeitado por VOLUME_BELOW_CONTENT', () => {
    const result = evaluatePackageBoxCatalogSanity(
      BATATA_PALHA_CANDIDATE_REINTERPRETED_MM,
      BATATA_PALHA_CONTENT,
    )

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).not.toContain('EDGE_TOO_LARGE')
    expect(result.reasons).not.toContain('EDGE_TOO_SMALL')
    expect(result.reasons).toContain('VOLUME_BELOW_CONTENT')
  })

  test('CA01b: a faixa de densidade genérica (50–1200 kg/m³) aceitaria a batata palha — prova da necessidade da faixa por NCM', () => {
    const result = evaluatePackageBoxCatalogSanity(
      BATATA_PALHA_CANDIDATE_REINTERPRETED_MM,
      GENERIC_DENSITY_RANGE_CONTENT,
    )

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).not.toContain('DENSITY_OUT_OF_RANGE')
    expect(result.reasons).toContain('VOLUME_BELOW_CONTENT')
  })

  test('a faixa de densidade por NCM (100–150 kg/m³) rejeita a mesma caixa por DENSITY_OUT_OF_RANGE (densidade calculada: ~486 kg/m³)', () => {
    const result = evaluatePackageBoxCatalogSanity(
      BATATA_PALHA_CANDIDATE_REINTERPRETED_MM,
      BATATA_PALHA_CONTENT,
    )

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).toContain('DENSITY_OUT_OF_RANGE')
  })

  test('NCM sem faixa de densidade conhecida: nunca DENSITY_OUT_OF_RANGE, só os outros códigos', () => {
    const result = evaluatePackageBoxCatalogSanity(
      BATATA_PALHA_CANDIDATE_AS_PROVIDED,
      BATATA_PALHA_CONTENT_WITHOUT_DENSITY_RANGE,
    )

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).not.toContain('DENSITY_OUT_OF_RANGE')
  })

  test('EDGE_TOO_SMALL: aresta abaixo de 20 mm é rejeitada', () => {
    const candidate: PackageBoxCatalogCandidate = {
      grossWeightGrams: 500,
      heightMm: 19,
      lengthMm: 300,
      unitsPerBox: 1,
      widthMm: 200,
    }
    const content: PackageBoxCatalogContentReference = { unitNetWeightGrams: 400 }

    const result = evaluatePackageBoxCatalogSanity(candidate, content)

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).toContain('EDGE_TOO_SMALL')
  })

  test('EDGE_TOO_LARGE: aresta acima de 2500 mm é rejeitada', () => {
    const candidate: PackageBoxCatalogCandidate = {
      grossWeightGrams: 5000,
      heightMm: 300,
      lengthMm: EDGE_MAX_MM + 1,
      unitsPerBox: 1,
      widthMm: 200,
    }
    const content: PackageBoxCatalogContentReference = { unitNetWeightGrams: 1000 }

    const result = evaluatePackageBoxCatalogSanity(candidate, content)

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).toContain('EDGE_TOO_LARGE')
  })

  test('UNIT_AMBIGUOUS: o conjunto só fecha se reinterpretado em outra unidade (mm lido como cm)', () => {
    // 1 unidade de 200 g, caixa "digitada" em cm (4000/3000/2000 mm) — dividida por 10 (400/300/200 mm)
    // e com peso plausível, o conjunto inteiro fecha: exatamente a hipótese "cabe se mm".
    const candidate: PackageBoxCatalogCandidate = {
      grossWeightGrams: 210,
      heightMm: 2000,
      lengthMm: 4000,
      unitsPerBox: 1,
      widthMm: 3000,
    }
    const content: PackageBoxCatalogContentReference = { unitNetWeightGrams: 200 }

    const result = evaluatePackageBoxCatalogSanity(candidate, content)

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.reasons).toContain('EDGE_TOO_LARGE')
    expect(result.reasons).toContain('UNIT_AMBIGUOUS')
  })

  test('sem nenhum motivo de rejeição, a proposta é aceita', () => {
    const candidate: PackageBoxCatalogCandidate = {
      grossWeightGrams: 1700,
      heightMm: 240,
      lengthMm: 300,
      unitsPerBox: 1,
      widthMm: 200,
    }
    const content: PackageBoxCatalogContentReference = { unitNetWeightGrams: 1600 }

    const result = evaluatePackageBoxCatalogSanity(candidate, content)

    expect(result.accepted).toBe(true)
  })

  test('EDGE_MIN_MM e EDGE_MAX_MM são os limites documentados no RF05 (20 mm e 2500 mm)', () => {
    expect(EDGE_MIN_MM).toBe(20)
    expect(EDGE_MAX_MM).toBe(2500)
  })
})
