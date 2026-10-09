/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.3 (ADR-0100 §6, CA14): o aviso de feriado por parada. A montagem pergunta UMA vez a `day-checks` quando o
 * solver termina — a cidade é o 1º segmento da chave da parada, o dia é o civil de São Paulo da chegada prevista —, o
 * cliente fala o contrato da rota, o texto é neutro e nomeia escopo, origem e nome, e a rota que cai devolve ao aviso
 * nacional de hoje. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import {
  createDayChecksClient,
  type DayChecksClient,
} from '../../src/modules/trip/shared/dayChecksClient.service'
import {
  DAY_CHECKS_MAX_ITEMS,
  matchDayCheckWarnings,
  planDayChecks,
  toSaoPauloCivilDate,
} from '../../src/modules/trip/shared/holidayWarningPlan.service'
import { buildHolidayWarningText } from '../../src/modules/trip/shared/holidayWarningText.service'
import { resolveRouteFinish } from '../../src/modules/trip/shared/routeSchedule.service'
import { readStopCityCode } from '../../src/modules/trip/shared/stopAddressKey.service'
import type { HolidayWarning } from '../../src/modules/trip/shared/trip.types'

import english from '../../src/modules/trip/locales/trip.en.locale.json'
import portuguese from '../../src/modules/trip/locales/trip.locale.json'

const CAMPINAS = '3509502'
const CURITIBA = '4106902'

const stop = (sequence: number, addressKey: string, estimatedArrivalAt: null | string) => ({
  addressKey,
  estimatedArrivalAt,
  sequence,
})

const campinasWarning: HolidayWarning = {
  cityIbgeCode: Number(CAMPINAS),
  date: '2026-10-13',
  reasons: [{ name: 'Aniversário da cidade', origin: 'imported', scope: 'municipal' }],
}

describe('a cidade da parada é o 1º segmento da chave (spec 252 T5.3)', () => {
  it('lê o código antes do primeiro `|`', () => {
    expect(readStopCityCode(`${CAMPINAS}|13010001|45`)).toBe(CAMPINAS)
    expect(readStopCityCode('|13010001|45')).toBe('')
  })
})

describe('o dia da entrega é o civil de São Paulo da chegada prevista', () => {
  it('chegada depois das 21h em Brasília ainda é o mesmo dia, e antes da meia-noite UTC não adianta', () => {
    expect(toSaoPauloCivilDate('2026-10-13T13:00:00.000Z')).toBe('2026-10-13')
    expect(toSaoPauloCivilDate('2026-10-14T01:00:00.000Z')).toBe('2026-10-13')
    expect(toSaoPauloCivilDate('2026-10-13T02:59:00.000Z')).toBe('2026-10-12')
  })

  it('instante ilegível não vira data inventada', () => {
    expect(toSaoPauloCivilDate('amanhã')).toBeUndefined()
  })
})

describe('o pedido único a `day-checks`', () => {
  it('junta a mesma cidade e o mesmo dia numa só linha, e cada parada fica ligada ao seu par', () => {
    const plan = planDayChecks([
      stop(1, `${CAMPINAS}|13010001|45`, '2026-10-13T13:00:00.000Z'),
      stop(2, `${CAMPINAS}|13010002|10`, '2026-10-13T15:00:00.000Z'),
      stop(3, `${CURITIBA}|80010000|S/N`, '2026-10-14T01:00:00.000Z'),
    ])

    expect(plan.items).toEqual([
      { cityIbgeCode: CAMPINAS, date: '2026-10-13' },
      { cityIbgeCode: CURITIBA, date: '2026-10-13' },
    ])
    expect(plan.targets.map((target) => target.addressKey)).toEqual([
      `${CAMPINAS}|13010001|45`,
      `${CAMPINAS}|13010002|10`,
      `${CURITIBA}|80010000|S/N`,
    ])
    expect(plan.isTooLarge).toBe(false)
  })

  it('parada sem chegada prevista ou sem cidade de IBGE não entra no pedido', () => {
    const plan = planDayChecks([
      stop(1, `${CAMPINAS}|13010001|45`, null),
      stop(2, `cidade:${CAMPINAS}`, '2026-10-13T13:00:00.000Z'),
      stop(3, '|13010001|45', '2026-10-13T13:00:00.000Z'),
      stop(4, '9999999|13010001|45', '2026-10-13T13:00:00.000Z'),
    ])

    expect(plan.items).toEqual([])
    expect(plan.targets).toEqual([])
  })

  it('mais de 200 pares distintos não cabem num pedido: o plano diz que é grande demais', () => {
    const stops = Array.from({ length: DAY_CHECKS_MAX_ITEMS + 1 }, (_, index) =>
      stop(
        index + 1,
        `${CAMPINAS}|${String(index).padStart(8, '0')}|1`,
        `2026-${String(1 + (index % 12)).padStart(2, '0')}-${String(1 + Math.floor(index / 12)).padStart(2, '0')}T13:00:00.000Z`,
      ),
    )

    const plan = planDayChecks(stops)

    expect(plan.isTooLarge).toBe(true)
    expect(plan.items).toEqual([])
  })

  it('exatamente 200 pares distintos ainda cabem', () => {
    const stops = Array.from({ length: DAY_CHECKS_MAX_ITEMS }, (_, index) =>
      stop(
        index + 1,
        `${CAMPINAS}|${String(index).padStart(8, '0')}|1`,
        `2026-${String(1 + (index % 12)).padStart(2, '0')}-${String(1 + Math.floor(index / 12)).padStart(2, '0')}T13:00:00.000Z`,
      ),
    )

    const plan = planDayChecks(stops)

    expect(plan.isTooLarge).toBe(false)
    expect(plan.items).toHaveLength(DAY_CHECKS_MAX_ITEMS)
  })
})

describe('o aviso volta para a parada certa', () => {
  const plan = planDayChecks([
    stop(1, `${CAMPINAS}|13010001|45`, '2026-10-13T13:00:00.000Z'),
    stop(2, `${CAMPINAS}|13010002|10`, '2026-10-13T15:00:00.000Z'),
    stop(3, `${CURITIBA}|80010000|S/N`, '2026-10-13T13:00:00.000Z'),
    stop(4, `${CAMPINAS}|13010003|1`, '2026-10-14T13:00:00.000Z'),
  ])

  it('casa pelo par cidade e dia: as duas paradas de Campinas no dia 13, e só elas', () => {
    const byStop = matchDayCheckWarnings({ targets: plan.targets, warnings: [campinasWarning] })

    expect([...byStop.keys()]).toEqual([
      `${CAMPINAS}|13010001|45`,
      `${CAMPINAS}|13010002|10`,
    ])
    expect(byStop.get(`${CAMPINAS}|13010001|45`)).toEqual([campinasWarning])
  })

  it('sem aviso para o par, a parada não ganha nada', () => {
    expect(matchDayCheckWarnings({ targets: plan.targets, warnings: [] }).size).toBe(0)
  })
})

describe('o término do roteiro com a pergunta já respondida', () => {
  const stops = [{ estimatedArrivalAt: '2026-12-25T18:00:00Z', sequence: 1 }]

  it('por padrão avisa o feriado nacional, como antes', () => {
    const finish = resolveRouteFinish({ distanceMetres: 1, durationSeconds: 1, stops })

    expect(finish.warnings.map((warning) => warning.kind)).toEqual(['feriado'])
  })

  it('com o `day-checks` respondido o aviso nacional sai: quem avisa é cada parada', () => {
    const finish = resolveRouteFinish({
      distanceMetres: 1,
      durationSeconds: 1,
      includeNationalHoliday: false,
      stops,
    })

    expect(finish.warnings).toEqual([])
  })

  it('o fim de semana continua no aviso do término (o `day-checks` não o cobre)', () => {
    const finish = resolveRouteFinish({
      distanceMetres: 1,
      durationSeconds: 1,
      includeNationalHoliday: false,
      stops: [{ estimatedArrivalAt: '2026-09-05T18:00:00Z', sequence: 1 }],
    })

    expect(finish.warnings.map((warning) => warning.kind)).toEqual(['fim-de-semana'])
  })
})

describe('o texto do aviso: neutro, com escopo, nome e origem', () => {
  const pt = i18n.getFixedT('pt-BR', 'trip')
  const en = i18n.getFixedT('en', 'trip')

  it('municipal importado, com a cidade', () => {
    expect(
      buildHolidayWarningText({
        language: 'pt-BR',
        placeLabel: 'Campinas/SP',
        t: pt,
        warning: campinasWarning,
      }),
    ).toBe(
      'Entrega prevista em 13/10/2026 em Campinas/SP: feriado municipal — Aniversário da cidade (importado). Confira se o cliente recebe.',
    )
  })

  it('sem o nome da cidade, o texto omite a cidade em vez de inventar', () => {
    expect(buildHolidayWarningText({ language: 'pt-BR', t: pt, warning: campinasWarning })).toBe(
      'Entrega prevista em 13/10/2026: feriado municipal — Aniversário da cidade (importado). Confira se o cliente recebe.',
    )
  })

  it('o nome da cidade que a API manda vale mais que o rótulo da tela', () => {
    expect(
      buildHolidayWarningText({
        language: 'pt-BR',
        placeLabel: 'Campinas/SP',
        t: pt,
        warning: { ...campinasWarning, cityName: 'Campinas' },
      }),
    ).toContain('em Campinas:')
  })

  it('nacional: o nome sai do locale pela chave estável, sem origem entre parênteses', () => {
    expect(
      buildHolidayWarningText({
        language: 'pt-BR',
        t: pt,
        warning: {
          cityIbgeCode: Number(CAMPINAS),
          date: '2026-12-25',
          reasons: [{ name: 'christmas', origin: 'code', scope: 'national' }],
        },
      }),
    ).toBe('Entrega prevista em 25/12/2026: feriado nacional — Natal. Confira se o cliente recebe.')
  })

  it('estadual cadastrado, e a regra "todo ano" também é cadastrada', () => {
    const base = { cityIbgeCode: Number(CAMPINAS), date: '2026-07-09' }
    const typed = buildHolidayWarningText({
      language: 'pt-BR',
      t: pt,
      warning: {
        ...base,
        reasons: [{ name: 'Revolução Constitucionalista', origin: 'typed', scope: 'state' }],
      },
    })
    const rule = buildHolidayWarningText({
      language: 'pt-BR',
      t: pt,
      warning: {
        ...base,
        reasons: [{ name: 'Revolução Constitucionalista', origin: 'rule', scope: 'state' }],
      },
    })

    expect(typed).toContain('feriado estadual — Revolução Constitucionalista (cadastrado)')
    expect(rule).toContain('(cadastrado)')
  })

  it('duas causas no mesmo dia aparecem juntas', () => {
    const text = buildHolidayWarningText({
      language: 'pt-BR',
      t: pt,
      warning: {
        ...campinasWarning,
        reasons: [
          { name: 'Aniversário da cidade', origin: 'typed', scope: 'municipal' },
          { name: 'Revolução Constitucionalista', origin: 'imported', scope: 'state' },
        ],
      },
    })

    expect(text).toContain('feriado municipal — Aniversário da cidade (cadastrado)')
    expect(text).toContain('feriado estadual — Revolução Constitucionalista (importado)')
  })

  it('escopo e origem que a tela não conhece saem como a API mandou, sem derrubar o aviso', () => {
    const text = buildHolidayWarningText({
      language: 'pt-BR',
      t: pt,
      warning: {
        ...campinasWarning,
        reasons: [{ name: 'Dia X', origin: 'novo', scope: 'distrital' }],
      },
    })

    expect(text).toContain('feriado distrital — Dia X')
  })

  it('em inglês', () => {
    expect(
      buildHolidayWarningText({
        language: 'en',
        placeLabel: 'Campinas/SP',
        t: en,
        warning: campinasWarning,
      }),
    ).toBe(
      'Expected delivery on 10/13/2026 in Campinas/SP: municipal holiday — Aniversário da cidade (imported). Check whether the customer receives.',
    )
  })

  it('nunca manda bloquear: o texto só informa e pede conferência', () => {
    const text = buildHolidayWarningText({ language: 'pt-BR', t: pt, warning: campinasWarning })

    expect(text).toContain('Confira se o cliente recebe.')
    expect(text.toLowerCase()).not.toContain('não é possível')
    expect(text.toLowerCase()).not.toContain('bloque')
  })
})

describe('locale do aviso de feriado', () => {
  type Tree = Readonly<{ [key: string]: string | Tree }>
  function flatten(tree: Tree, prefix = ''): readonly string[] {
    return Object.entries(tree).flatMap(([key, value]) =>
      typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`),
    )
  }

  it('as mesmas chaves nos dois idiomas', () => {
    expect([...flatten(english.holidayWarning)].sort()).toEqual(
      [...flatten(portuguese.holidayWarning)].sort(),
    )
  })

  it('toda chave de feriado nacional da API tem nome nos dois idiomas', () => {
    const keys = [
      'all_souls_day',
      'black_consciousness',
      'carnival',
      'christmas',
      'corpus_christi',
      'good_friday',
      'independence_day',
      'labour_day',
      'our_lady_of_aparecida',
      'republic_proclamation',
      'tiradentes',
      'universal_fraternization',
    ]
    for (const key of keys) {
      expect(Object.keys(portuguese.holidayWarning.national)).toContain(key)
      expect(Object.keys(english.holidayWarning.national)).toContain(key)
    }
  })
})

describe('cliente de `POST /business-calendar/day-checks`', () => {
  type Recorded = { body: string; headers: Headers; method: string; url: string }

  function setup(response: () => Response): { calls: Recorded[]; client: DayChecksClient } {
    const calls: Recorded[] = []
    const client = createDayChecksClient({
      apiUrl: 'http://api.test',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        calls.push({
          body: await request.clone().text(),
          headers: request.headers,
          method: request.method,
          url: request.url,
        })
        return response()
      },
      getAccessToken: () => Promise.resolve('token-123'),
    })
    return { calls, client }
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status,
    })
  }

  it('manda só `items` com cidade e data, com o token, e lê os avisos', async () => {
    const { calls, client } = setup(() => json({ data: [campinasWarning] }))

    const warnings = await client.check([{ cityIbgeCode: CAMPINAS, date: '2026-10-13' }])

    expect(warnings).toEqual([campinasWarning])
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe('http://api.test/business-calendar/day-checks')
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-123')
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({
      items: [{ cityIbgeCode: CAMPINAS, date: '2026-10-13' }],
    })
  })

  it('lista vazia é "nenhum dia fecha por feriado"', async () => {
    const { client } = setup(() => json({ data: [] }))

    expect(await client.check([{ cityIbgeCode: CAMPINAS, date: '2026-10-14' }])).toEqual([])
  })

  it('403, 422 e 500 viram falha, para a tela cair no aviso nacional', async () => {
    for (const status of [403, 422, 500]) {
      const { client } = setup(() => json({ error: { code: 'X', message: 'x' } }, status))

      await expect(client.check([{ cityIbgeCode: CAMPINAS, date: '2026-10-13' }])).rejects.toThrow()
    }
  })

  it('resposta fora do formato é recusada, não aceita pela metade', async () => {
    const { client } = setup(() => json({ data: [{ ...campinasWarning, cityIbgeCode: 'x' }] }))

    await expect(client.check([{ cityIbgeCode: CAMPINAS, date: '2026-10-13' }])).rejects.toThrow()
  })

  it('rede que cai também é falha', async () => {
    const client = createDayChecksClient({
      apiUrl: 'http://api.test',
      fetch: () => Promise.reject(new Error('offline')),
      getAccessToken: () => Promise.resolve('t'),
    })

    await expect(client.check([{ cityIbgeCode: CAMPINAS, date: '2026-10-13' }])).rejects.toThrow()
  })
})

describe('a fiação das telas (o aviso só informa)', () => {
  const read = (path: string): string =>
    readFileSync(new URL(`../../src/modules/trip/${path}`, import.meta.url), 'utf8')

  it('a lista de paradas da montagem imprime o aviso da parada que o solver devolveu', () => {
    const map = read('components/TripAssemblyMap.component.tsx')

    expect(map).toContain('AssemblyStopHolidayNotice')
    expect(map).toContain('solver.holidayWarnings.get(point.stopKey)')
  })

  it('o detalhe da viagem põe o selo na parada, e o selo não toca nas ações', () => {
    const list = read('components/TripStopList.component.tsx')

    expect(list).toContain('TripStopHolidayBadge')
    expect(list).toContain('stop.holidayWarnings')
  })

  it('"Criar viagem" não conhece o aviso: nada do aviso entra em condição de desabilitar', () => {
    const map = read('components/TripAssemblyMap.component.tsx')
    const disabledLines = map.split('\n').filter((line) => line.includes('disabled='))

    expect(disabledLines.some((line) => line.toLowerCase().includes('holiday'))).toBe(false)
  })
})
