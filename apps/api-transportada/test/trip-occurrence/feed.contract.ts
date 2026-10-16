/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A listagem de ocorrências do escritório: a fusão das duas fontes e a fronteira da rota.
 */
import { describe, expect, test } from 'bun:test'

import { mergeOccurrenceFeed } from '../../src/trips/domain/occurrence-feed.policy.js'
import { parseTripOccurrenceFeedList } from '../../src/trips/presentation/trip-occurrence-feed.schema.js'

function entry(createdAt: string, id: string): { createdAt: Date; id: string } {
  return { createdAt: new Date(createdAt), id }
}

const FIRST = entry('2026-09-01T10:00:00.000Z', '00000000-0000-4000-8000-000000000001')
const SECOND = entry('2026-09-01T11:00:00.000Z', '00000000-0000-4000-8000-000000000002')
const THIRD = entry('2026-09-01T12:00:00.000Z', '00000000-0000-4000-8000-000000000003')

describe('fusão das duas fontes de ocorrência', () => {
  test('ordena por hora decrescente por padrão, atravessando as fontes', () => {
    const result = mergeOccurrenceFeed({
      limit: 10,
      order: 'desc',
      sources: [[FIRST, THIRD], [SECOND]],
    })
    expect(result.items.map((item) => item.id)).toEqual([THIRD.id, SECOND.id, FIRST.id])
    expect(result.hasMore).toBe(false)
  })

  test('ordena crescente quando pedido', () => {
    const result = mergeOccurrenceFeed({
      limit: 10,
      order: 'asc',
      sources: [[THIRD], [FIRST, SECOND]],
    })
    expect(result.items.map((item) => item.id)).toEqual([FIRST.id, SECOND.id, THIRD.id])
  })

  test('corta no limite e anuncia página seguinte — mesmo com a sobra numa fonte só', () => {
    const result = mergeOccurrenceFeed({
      limit: 2,
      order: 'desc',
      sources: [[FIRST, SECOND, THIRD], []],
    })
    expect(result.items.map((item) => item.id)).toEqual([THIRD.id, SECOND.id])
    expect(result.hasMore).toBe(true)
  })

  test('desempata pelo id na mesma hora — o mesmo desempate do order by', () => {
    const twinA = entry('2026-09-01T10:00:00.000Z', '00000000-0000-4000-8000-00000000000a')
    const twinB = entry('2026-09-01T10:00:00.000Z', '00000000-0000-4000-8000-00000000000b')
    const result = mergeOccurrenceFeed({ limit: 10, order: 'desc', sources: [[twinA], [twinB]] })
    expect(result.items.map((item) => item.id)).toEqual([twinB.id, twinA.id])
  })
})

function parse(query: string): ReturnType<typeof parseTripOccurrenceFeedList> {
  return parseTripOccurrenceFeedList(new URL(`https://api.local/trip-occurrences${query}`))
}

describe('fronteira da listagem de ocorrências', () => {
  test('sem parâmetros: página padrão, ordem decrescente, sem filtros', () => {
    expect(parse('')).toEqual({ cursor: null, limit: 25, order: 'desc' })
  })

  test('filtros multi-valor viram listas', () => {
    const parsed = parse('?stageIn=separation,stop&plateIn=ABC1D23,DEF4G56&typeIn=recusa_total')
    expect(parsed.filters).toEqual({
      plateIn: ['ABC1D23', 'DEF4G56'],
      stageIn: ['separation', 'stop'],
      typeIn: ['recusa_total'],
    })
  })

  test('o período é canonicalizado em ISO', () => {
    const parsed = parse(
      '?createdFrom=2026-09-01T00:00:00.000Z&createdUntil=2026-09-02T00:00:00.000Z',
    )
    expect(parsed.filters).toEqual({
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdUntil: '2026-09-02T00:00:00.000Z',
    })
  })

  test('perPage tem teto de 100 e piso de 1', () => {
    expect(parse('?perPage=100').limit).toBe(100)
    expect(() => parse('?perPage=101')).toThrow()
    expect(() => parse('?perPage=0')).toThrow()
  })

  test('ordem só aceita asc e desc', () => {
    expect(parse('?order=asc').order).toBe('asc')
    expect(() => parse('?order=up')).toThrow()
  })

  test('grupo fora do vocabulário é recusa, não silêncio', () => {
    expect(() => parse('?stageIn=galpao')).toThrow()
  })

  test('chave desconhecida é recusa — filtro digitado errado não devolve a lista inteira', () => {
    expect(() => parse('?plate=ABC1D23')).toThrow()
  })

  test('cursor malformado é recusa', () => {
    expect(() => parse('?cursor=abc')).toThrow()
    expect(() =>
      parse('?cursor=2026-09-01T10:00:00.000Z::00000000-0000-4000-8000-000000000001'),
    ).not.toThrow()
  })

  /** Spec 164 T8 (RF11): o filtro por estado da tratativa mistura estados reais com `'none'`. */
  test('caseStatusIn aceita estados da tratativa e "none" (sem tratativa)', () => {
    const parsed = parse('?caseStatusIn=recorded,none,closed')
    expect(parsed.filters).toEqual({ caseStatusIn: ['recorded', 'none', 'closed'] })
  })

  test('caseStatusIn fora do vocabulário é recusa, não silêncio', () => {
    expect(() => parse('?caseStatusIn=invented')).toThrow()
  })

  /** Spec 248 RF5/RF13: "Atrasadas" é `contractorReplyStatusIn=overdue`, validado contra o vocabulário do retorno. */
  test('contractorReplyStatusIn aceita estados do retorno, um ou vários, e convive com o cursor', () => {
    expect(parse('?contractorReplyStatusIn=overdue').filters).toEqual({
      contractorReplyStatusIn: ['overdue'],
    })
    expect(parse('?contractorReplyStatusIn=overdue,awaiting_contractor').filters).toEqual({
      contractorReplyStatusIn: ['overdue', 'awaiting_contractor'],
    })

    const withCursor = parse(
      '?contractorReplyStatusIn=overdue&cursor=2026-09-01T10:00:00.000Z::00000000-0000-4000-8000-000000000001',
    )
    expect(withCursor.cursor).toBe('2026-09-01T10:00:00.000Z::00000000-0000-4000-8000-000000000001')
    expect(withCursor.filters).toEqual({ contractorReplyStatusIn: ['overdue'] })
  })

  test('contractorReplyStatusIn fora do vocabulário, vazio ou repetido é recusa, não silêncio', () => {
    expect(() => parse('?contractorReplyStatusIn=late')).toThrow()
    expect(() => parse('?contractorReplyStatusIn=overdue,late')).toThrow()
    expect(() => parse('?contractorReplyStatusIn=')).toThrow()
    expect(() =>
      parse('?contractorReplyStatusIn=overdue&contractorReplyStatusIn=delivered'),
    ).toThrow()
  })

  test('sem o parâmetro não há filtro de retorno', () => {
    expect(parse('?stageIn=delivery').filters).toEqual({ stageIn: ['delivery'] })
  })

  /** Spec 266 T2.9: o andamento com o motorista; `reopened` é o último evento `reopened`. */
  test('resolutionStateIn aceita os quatro estados, um ou vários', () => {
    expect(parse('?resolutionStateIn=reopened').filters).toEqual({
      resolutionStateIn: ['reopened'],
    })
    expect(parse('?resolutionStateIn=open,reopened').filters).toEqual({
      resolutionStateIn: ['open', 'reopened'],
    })
    expect(parse('?resolutionStateIn=resolved,cancelled').filters).toEqual({
      resolutionStateIn: ['resolved', 'cancelled'],
    })
  })

  test('resolutionStateIn fora do vocabulário, vazio ou repetido é recusa', () => {
    expect(() => parse('?resolutionStateIn=closed')).toThrow()
    expect(() => parse('?resolutionStateIn=open,closed')).toThrow()
    expect(() => parse('?resolutionStateIn=')).toThrow()
    expect(() => parse('?resolutionStateIn=open&resolutionStateIn=resolved')).toThrow()
  })
})
