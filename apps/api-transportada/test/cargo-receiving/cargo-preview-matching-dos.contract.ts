/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S2): o vínculo roda DENTRO da trava advisory do
 * contratante, então o custo dele é o tempo que a trava fica presa. Antes: 19 900 linhas do mesmo
 * roteiro e código levavam 12,9 s (O(n²) em `hasOption` e na lista das candidatas do estouro), e
 * cada cliente refazia o filtro de todas as notas livres. Os tetos aqui são folgados para a CI, mas
 * o código antigo estoura todos.
 */
import { describe, expect, test } from 'bun:test'

import {
  createWeightCloses,
  toMatchDocument,
  toMatchLine,
} from '../../src/cargo-receiving/domain/cargo-preview-match-input.policy.js'
import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import { pairRoutesWithLoads } from '../../src/cargo-receiving/domain/cargo-preview-route-pairing.policy.js'
import type { ResolveCargoPreviewMatchesParams } from '../../src/cargo-receiving/domain/cargo-preview-matching.types.js'
import { candidate, matchParams, previewItem } from '../fixtures/cargo-preview-matching.fixture.js'

const MATCH_TIME_CEILING_MS = 1_500

/** O cenário do revisor: n linhas do mesmo roteiro e código, valores repetidos sobre 300 notas. */
function sameClusterScenario(lineCount: number): ResolveCargoPreviewMatchesParams {
  const documentCount = 300
  const candidates = Array.from({ length: documentCount }, (_unused, index) =>
    candidate(`d${String(index).padStart(5, '0')}`, {
      recipientName: 'X',
      recipientTaxId: '99000000000100',
      totalValue: `${100 + index}.00`,
    }),
  )
  const items = Array.from({ length: lineCount }, (_unused, index) =>
    previewItem(`i${index}`, {
      recipientCode: 'C1',
      recipientName: 'X',
      routeName: 'R1',
      value: `${100 + (index % documentCount)}.00`,
      weightKg: '10.00',
    }),
  )
  return matchParams({ candidates, items })
}

/** n clientes diferentes contra muitas notas livres: cada cliente refiltrava todas elas. */
function manyClustersScenario(input: {
  readonly documentCount: number
  readonly lineCount: number
}): ResolveCargoPreviewMatchesParams {
  const candidates = Array.from({ length: input.documentCount }, (_unused, index) =>
    candidate(`d${String(index).padStart(5, '0')}`, {
      recipientPostalCode: String(index).padStart(8, '0'),
      totalValue: `${1_000 + index}.00`,
    }),
  )
  const items = Array.from({ length: input.lineCount }, (_unused, index) =>
    previewItem(`i${index}`, {
      postalCode: String(index).padStart(8, '0'),
      recipientCode: `C${index}`,
      routeName: 'R1',
      value: `${1_000 + index}.00`,
    }),
  )
  return matchParams({ candidates, items })
}

function timed(params: ResolveCargoPreviewMatchesParams) {
  const startedAt = performance.now()
  const result = resolveCargoPreviewMatches(params)
  return { elapsedMs: performance.now() - startedAt, result }
}

describe('o vínculo não segura a trava do contratante (spec 237, segurança S2)', () => {
  test.each([4_000, 8_000, 16_000])(
    '%p linhas no mesmo roteiro e código contra 300 notas, dentro do teto',
    (lineCount) => {
      const { elapsedMs, result } = timed(sameClusterScenario(lineCount))
      expect(elapsedMs).toBeLessThan(MATCH_TIME_CEILING_MS)
      expect(new Set(result.items.map((item) => item.state))).toEqual(new Set(['ambiguous']))
      expect(result.items[0]?.documentIds).toEqual(['d00000'])
    },
    60_000,
  )

  test('5 000 clientes diferentes contra 5 000 notas livres, dentro do teto', () => {
    const { elapsedMs, result } = timed(
      manyClustersScenario({ documentCount: 5_000, lineCount: 5_000 }),
    )
    expect(elapsedMs).toBeLessThan(MATCH_TIME_CEILING_MS)
    expect(result.items.filter((item) => item.state === 'matched')).toHaveLength(5_000)
  }, 60_000)

  test.each([
    ['por roteiro, mesmo sem par possível', '999.00', 0],
    ['por par pontuado, depois dos roteiros', '100.00', 1],
  ] as const)('o par roteiro ↔ carga consulta o orçamento %s', (_label, totalValue, allowed) => {
    const lines = [previewItem('a')].flatMap((item, index) => toMatchLine(item, index) ?? [])
    const documents = [candidate('d1', { loadReference: '69001', totalValue })].flatMap(
      (document) => toMatchDocument(document) ?? [],
    )
    let checks = 0
    const budget = {
      check: (): void => {
        checks += 1
        if (checks > allowed) throw new Error('MATCH_BUDGET_EXCEEDED')
      },
    }
    expect(() =>
      pairRoutesWithLoads({
        budget,
        documents,
        knownRoutePairs: [],
        lines,
        weightCloses: createWeightCloses(0),
      }),
    ).toThrow('MATCH_BUDGET_EXCEEDED')
  })

  test('o vínculo consulta o orçamento: estourou, para no meio', () => {
    const params = manyClustersScenario({ documentCount: 50, lineCount: 50 })
    let checks = 0
    const budget = {
      check: (): void => {
        checks += 1
        if (checks > 3) throw new Error('MATCH_BUDGET_EXCEEDED')
      },
    }
    expect(() => resolveCargoPreviewMatches({ ...params, budget })).toThrow('MATCH_BUDGET_EXCEEDED')
  })
})
