/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162, T001 — três linhas do formato real do JSONL de captura (spec 161,
 * `box-catalog-harvest.jsonl`, 613 linhas: 111 `found`, 502 `no_dimensions`, medido 21/09/2026).
 *
 * `FOUND_CM_KG_CAPTURE_LINE` é uma linha `found` real do arquivo (GTIN 7891150059849, sabonete Lux)
 * — comprimento/altura/largura em centímetro com a unidade colada no valor ("330,0 cm"), peso em
 * quilograma. `FOUND_MANUAL_LADO_CAPTURE_LINE` segue o formato documentado de captura manual fora
 * do Cosmos (`cosmos-capture.user.js`, `extractEdges`/`TRIPLE_PATTERN`): a página não tem tabela
 * fechada, o regex só sabe três números e o rótulo genérico `lado1..3` — nenhuma linha real do
 * arquivo tem `status: found_manual` ainda (a captura manual da spec 161 é recente), por isso é
 * sintética, no mesmo formato do payload que `assisted-capture-server.ts` grava. `CROOKED_CAPTURE_LINE`
 * reaproveita a medida torta do Tixan (spec 160, `gtin-catalog.fixture.ts`) no formato de linha do
 * JSONL — arestas em centímetro que viram 4740×2470×2400 mm, muito acima do teto de 2500 mm.
 */
import type { PackageBoxCatalogCaptureLine } from '../../src/nfe-documents/domain/package-box-catalog-capture.schema.js'

/** Linha real (`box-catalog-harvest.jsonl`): GTIN 7891150059849, sabonete Lux, Cosmos. */
export const FOUND_CM_KG_CAPTURE_LINE: PackageBoxCatalogCaptureLine = {
  capturedAt: '2026-09-18T12:00:00.000Z',
  cartonGtin: '67891150059841',
  extracted: {
    edges: {
      altura: { unit: 'cm', value: '200,0 cm' },
      comprimento: { unit: 'cm', value: '330,0 cm' },
      largura: { unit: 'cm', value: '160,0 cm' },
    },
    grossWeight: { unit: 'kg', value: '0,010 kg' },
    unitsPerCarton: 108,
  },
  pageUrl: 'https://cosmos.bluesoft.com.br/produtos/7891150059849',
  source: 'cosmos',
  status: 'found',
  unitGtin: '7891150059849',
}

/** Normalização esperada de `FOUND_CM_KG_CAPTURE_LINE` (CA01): 330,0 cm → 3300 mm, 0,010 kg → 10 g. */
export const FOUND_CM_KG_EXPECTED_CANDIDATE = {
  cartonGtin: '67891150059841',
  engine: 'cosmos',
  grossWeightGrams: 10,
  heightMm: 2000,
  lengthMm: 3300,
  unitGtin: '7891150059849',
  unitsPerBox: 108,
  widthMm: 1600,
} as const

/** Captura manual sintética (formato de `assisted-capture-server.ts` + `TRIPLE_PATTERN`): lado1..3. */
export const FOUND_MANUAL_LADO_CAPTURE_LINE: PackageBoxCatalogCaptureLine = {
  capturedAt: '2026-09-19T09:30:00.000Z',
  cartonGtin: '7898900123456',
  extracted: {
    edges: {
      lado1: { unit: 'cm', value: '30,0 cm' },
      lado2: { unit: 'cm', value: '20,0 cm' },
      lado3: { unit: 'cm', value: '24,0 cm' },
    },
    grossWeight: { unit: 'kg', value: '1,700 kg' },
    unitsPerCarton: 1,
  },
  pageUrl: 'https://www.fabricante-generico.com.br/produto/123',
  source: 'www.fabricante-generico.com.br',
  status: 'found_manual',
  unitGtin: '7898900123456',
}

export const FOUND_MANUAL_LADO_EXPECTED_CANDIDATE = {
  cartonGtin: '7898900123456',
  engine: 'manual:www.fabricante-generico.com.br',
  grossWeightGrams: 1700,
  heightMm: 240,
  lengthMm: 300,
  unitGtin: '7898900123456',
  unitsPerBox: 1,
  widthMm: 200,
} as const

/**
 * Fixture torta (spec 160, GTIN 7896098909768, Tixan) no formato de linha do JSONL — o Cosmos
 * gravou milímetro como centímetro: 474,0 × 247,0 × 240,0 cm vira 4740 × 2470 × 2400 mm, acima do
 * teto de 2500 mm (CA02). Nada pode ser gravado para esta linha.
 */
export const CROOKED_CAPTURE_LINE: PackageBoxCatalogCaptureLine = {
  capturedAt: '2026-09-18T12:05:00.000Z',
  cartonGtin: '17896098909765',
  extracted: {
    edges: {
      altura: { unit: 'cm', value: '240,0 cm' },
      comprimento: { unit: 'cm', value: '474,0 cm' },
      largura: { unit: 'cm', value: '247,0 cm' },
    },
    grossWeight: { unit: 'kg', value: '0,015 kg' },
    unitsPerCarton: 9,
  },
  pageUrl: 'https://cosmos.bluesoft.com.br/produtos/7896098909768',
  source: 'cosmos',
  status: 'found',
  unitGtin: '7896098909768',
}

/** Linha ignorada (`no_dimensions`, 502 das 613 do arquivo real) — sem `cartonGtin` nem arestas. */
export const NO_DIMENSIONS_CAPTURE_LINE: PackageBoxCatalogCaptureLine = {
  capturedAt: '2026-09-18T12:10:00.000Z',
  extracted: { edges: {} },
  pageUrl: 'https://cosmos.bluesoft.com.br/produtos/7891150039506',
  source: 'cosmos',
  status: 'no_dimensions',
  unitGtin: '7891150039506',
}
