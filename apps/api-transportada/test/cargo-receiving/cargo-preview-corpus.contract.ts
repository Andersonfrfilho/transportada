/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: a política de vínculo contra o corpus REAL anonimizado (FR-24-09 com os XMLs de
 * 23/09, FR-28-09 com os de 25/09). Os números são o retrato medido, não meta: mudou, alguém
 * mudou a regra — e tem de dizer por quê.
 */
import { describe, expect, test } from 'bun:test'

import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import type {
  CargoPreviewCandidateDocument,
  CargoPreviewMatchItem,
  RecipientAlias,
  ResolveCargoPreviewMatchesResult,
} from '../../src/cargo-receiving/domain/cargo-preview-matching.types.js'
import {
  CORPUS_SHEETS,
  loadCorpusDocuments,
  loadCorpusItems,
  toMatchItem,
} from '../fixtures/cargo-preview-corpus.fixture.js'

/** O padrão do perfil: o arredondamento da planilha (até 5 g) fica com o piso de 10 g da política. */
const PROFILE_DEFAULT_TOLERANCE_PERCENT = 0

const documents = await loadCorpusDocuments()
const sheets = await Promise.all(
  CORPUS_SHEETS.map(async (sheet) => ({
    ...sheet,
    candidates: documents.filter((document) => document.issuedAt.startsWith(sheet.day)),
    items: (await loadCorpusItems(sheet.file)).map(toMatchItem),
  })),
)
const [first, second] = sheets

function resolve(input: {
  readonly candidates: readonly CargoPreviewCandidateDocument[]
  readonly items: readonly CargoPreviewMatchItem[]
  readonly knownAliases?: readonly RecipientAlias[]
  readonly tolerance?: number
}): ResolveCargoPreviewMatchesResult {
  return resolveCargoPreviewMatches({
    budget: { check: () => undefined },
    candidates: input.candidates,
    items: input.items,
    knownAliases: input.knownAliases ?? [],
    knownRoutePairs: [],
    weightTolerancePercent: input.tolerance ?? PROFILE_DEFAULT_TOLERANCE_PERCENT,
  })
}

function countStates(result: ResolveCargoPreviewMatchesResult): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of result.items) counts[item.state] = (counts[item.state] ?? 0) + 1
  return counts
}

function customersOf(
  items: readonly CargoPreviewMatchItem[],
  result: ResolveCargoPreviewMatchesResult,
) {
  const customers = new Map<
    string,
    { documentIds: string[]; routeName: string; states: string[] }
  >()
  items.forEach((item, index) => {
    const key = `${item.routeName}|${item.recipientCode ?? index}`
    const match = result.items[index]
    const customer = customers.get(key) ?? {
      documentIds: [],
      routeName: item.routeName,
      states: [],
    }
    customer.states.push(match?.state ?? 'missing')
    customer.documentIds.push(...(match?.documentIds ?? []))
    customers.set(key, customer)
  })
  return [...customers.values()]
}

describe('o vínculo no corpus real anonimizado (spec 237 T4.3)', () => {
  if (first === undefined || second === undefined) throw new Error('CORPUS_SHEETS_MISSING')

  // Revisão da Fase 4a: 180→177 e 97→96 são linhas de par por votos que fechavam só valor e peso,
  // sem CEP, razão social nem alias — hoje sugestão, que o operador confirma (H1/M2).
  test('o retrato medido: com a tolerância 0 do perfil, ~95% e ~90% das linhas vinculam', () => {
    expect(countStates(resolve(first))).toEqual({ awaiting_xml: 2, matched: 177, suggested: 8 })
    expect(countStates(resolve(second))).toEqual({
      ambiguous: 2,
      awaiting_xml: 2,
      matched: 96,
      suggested: 7,
    })
  })

  test('0,05% acima do piso não muda nada: o arredondamento (até 5 g) já cabe nos 10 g', () => {
    expect(countStates(resolve({ ...first, tolerance: 0.05 }))).toEqual(countStates(resolve(first)))
    expect(countStates(resolve({ ...second, tolerance: 0.05 }))).toEqual(
      countStates(resolve(second)),
    )
  })

  // FR.ORLAN passou de votos a totais com o arredondamento por linha somada (M5): 47/47 → 60/60.
  test('por cliente a soma fecha em 155/165 e 93/104; nos roteiros de totais completos, 60/60 e 40/40', () => {
    for (const [sheet, all, complete] of [
      [first, [155, 165], [60, 60]],
      [second, [93, 104], [40, 40]],
    ] as const) {
      const result = resolve(sheet)
      const totals = new Set(
        result.routePairs.filter((pair) => pair.source === 'totals').map((pair) => pair.routeName),
      )
      const closed = (list: ReturnType<typeof customersOf>) =>
        list.filter((customer) => customer.states.every((state) => state === 'matched')).length
      const customers = customersOf(sheet.items, result)
      const completeCustomers = customers.filter((customer) => totals.has(customer.routeName))
      expect([closed(customers), customers.length]).toEqual([...all])
      expect([closed(completeCustomers), completeCustomers.length]).toEqual([...complete])
    }
  })

  test('FR.BARRI: 20 linhas para 16 notas, o mesmo valor total, tudo vinculado', () => {
    const result = resolve(first)
    const lines = first.items.flatMap((item, index) =>
      item.routeName === 'FR.BARRI' ? [result.items[index]] : [],
    )
    const pair = result.routePairs.find((item) => item.routeName === 'FR.BARRI')
    const load = first.candidates.filter(
      (document) => document.loadReference === pair?.loadReference,
    )
    expect([lines.length, load.length, pair?.source]).toEqual([20, 16, 'totals'])
    expect(lines.every((line) => line?.state === 'matched')).toBe(true)
    expect(new Set(lines.flatMap((line) => line?.documentIds ?? [])).size).toBe(16)
  })

  test('os casos reais estão no corpus e fecham', () => {
    const result = resolve(first)
    const customers = customersOf(first.items, result)
    const sameDocument = (customer: { documentIds: string[] }) => new Set(customer.documentIds).size
    expect(
      customers.some((customer) => customer.states.length === 3 && sameDocument(customer) === 1),
    ).toBe(true)
    expect(
      customers.some((customer) => customer.states.length === 2 && sameDocument(customer) === 1),
    ).toBe(true)
    expect(
      customers.some((customer) => customer.states.length === 2 && sameDocument(customer) === 2),
    ).toBe(true)
    const byId = new Map(first.candidates.map((document) => [document.id, document]))
    const postalCodeDiffers = first.items.filter((item, index) => {
      const match = result.items[index]
      return (
        match?.state === 'matched' &&
        byId.get(match.documentIds[0] ?? '')?.recipientPostalCode !== item.postalCode
      )
    })
    expect(postalCodeDiffers.length).toBeGreaterThan(0)
    const single = resolve(second).routePairs.find((pair) => pair.routeName === 'FR.R.PR2')
    expect(single?.source).toBe('totals')
  })

  test('o alias aprendido num dia vale no outro, sem conflito', () => {
    const learned = resolve(first).learnedAliases
    const codes = new Set(first.items.map((item) => item.recipientCode))
    expect(second.items.filter((item) => codes.has(item.recipientCode)).length).toBeGreaterThan(0)
    const withAliases = resolve({ ...second, knownAliases: learned })
    const byId = new Map(second.candidates.map((document) => [document.id, document]))
    const taxIdOf = new Map(learned.map((alias) => [alias.recipientCode, alias.recipientTaxId]))
    const conflicts = second.items.filter((item, index) => {
      const match = withAliases.items[index]
      const expected = taxIdOf.get(item.recipientCode ?? '')
      return (
        match?.state === 'matched' &&
        expected !== undefined &&
        byId.get(match.documentIds[0] ?? '')?.recipientTaxId !== expected
      )
    })
    expect(conflicts).toEqual([])
    expect(countStates(withAliases)['matched']).toBeGreaterThanOrEqual(97)
  })
})
