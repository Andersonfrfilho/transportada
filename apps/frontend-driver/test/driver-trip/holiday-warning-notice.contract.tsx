/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, test } from 'bun:test'

import { i18n } from '@/modules/shared/i18n/i18n.service'
import { DriverHolidayNotice } from '@/modules/driver-trip/components/DriverHolidayNotice.component'
import type { HolidayWarning } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  claimTripSnapshot,
  readLastTripSnapshot,
  saveTripSnapshot,
  type StoredTripSnapshot,
  type TripSnapshotStore,
} from '@/modules/driver-trip/shared/tripSnapshot.service'

/**
 * Spec 252 (T5.4, RF14, CA15, CA17): o aviso da parada é texto neutro, sem botão, e sai do snapshot
 * guardado. Renderização estática, no molde de `occurrence-type-icon-chip.contract.tsx`.
 */
const NOON_IN_SAO_PAULO_MS = Date.parse('2026-10-12T15:00:00.000Z')

function nationalToday(): HolidayWarning {
  return {
    cityIbgeCode: 3509502,
    cityName: 'Campinas',
    date: '2026-10-12',
    reasons: [{ name: 'our_lady_of_aparecida', origin: 'code', scope: 'national' }],
  }
}

function render(warnings: readonly HolidayWarning[] | undefined): string {
  return renderToStaticMarkup(
    <DriverHolidayNotice nowMs={NOON_IN_SAO_PAULO_MS} warnings={warnings} />,
  )
}

function textOf(html: string): string {
  return html
    .replaceAll(/<svg[\s\S]*?<\/svg>/gu, '')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

function source(path: string): string {
  return readFileSync(new URL(`../../src/modules/driver-trip/${path}`, import.meta.url), 'utf8')
}

afterAll(async () => {
  await i18n.changeLanguage('pt-BR')
})

describe('aviso de feriado da parada (spec 252 T5.4)', () => {
  test('nacional hoje: usa o nome traduzido da chave estável e pede conferência', async () => {
    await i18n.changeLanguage('pt-BR')

    expect(textOf(render([nationalToday()]))).toBe(
      'Hoje é feriado em Campinas (Nossa Senhora Aparecida). Confirme com o cliente antes de ir.',
    )
  })

  test('estadual em data futura: dia e mês, nome como veio', async () => {
    await i18n.changeLanguage('pt-BR')
    const warning: HolidayWarning = {
      cityIbgeCode: 3550308,
      cityName: 'São Paulo',
      date: '2026-11-20',
      reasons: [{ name: 'Revolução Constitucionalista', origin: 'typed', scope: 'state' }],
    }

    expect(textOf(render([warning]))).toBe(
      'Dia 20/11 é feriado em São Paulo (Revolução Constitucionalista). Confirme com o cliente antes de ir.',
    )
  })

  test('municipal sem cityName: a frase não nomeia cidade', async () => {
    await i18n.changeLanguage('pt-BR')
    const warning: HolidayWarning = {
      cityIbgeCode: 3509502,
      date: '2026-10-12',
      reasons: [{ name: 'Aniversário da cidade', origin: 'imported', scope: 'municipal' }],
    }

    expect(textOf(render([warning]))).toBe(
      'Hoje é feriado (Aniversário da cidade). Confirme com o cliente antes de ir.',
    )
  })

  test('mais de uma causa no mesmo dia vira uma lista na mesma frase', async () => {
    await i18n.changeLanguage('pt-BR')
    const warning: HolidayWarning = {
      ...nationalToday(),
      reasons: [
        { name: 'our_lady_of_aparecida', origin: 'code', scope: 'national' },
        { name: 'Padroeira da cidade', origin: 'typed', scope: 'municipal' },
      ],
    }

    expect(textOf(render([warning]))).toContain('(Nossa Senhora Aparecida, Padroeira da cidade)')
  })

  test('chave nacional desconhecida cai no rótulo genérico, nunca na chave crua', async () => {
    await i18n.changeLanguage('pt-BR')
    const warning: HolidayWarning = {
      ...nationalToday(),
      reasons: [{ name: 'dia_inventado_pela_api', origin: 'code', scope: 'national' }],
    }

    const text = textOf(render([warning]))

    expect(text).toContain('(Feriado nacional)')
    expect(text).not.toContain('dia_inventado_pela_api')
  })

  test('nome estadual em branco cai no rótulo do escopo', async () => {
    await i18n.changeLanguage('pt-BR')
    const warning: HolidayWarning = {
      ...nationalToday(),
      reasons: [{ name: '  ', origin: 'imported', scope: 'state' }],
    }

    expect(textOf(render([warning]))).toContain('(Feriado estadual)')
  })

  test('em inglês o mesmo aviso sai traduzido', async () => {
    await i18n.changeLanguage('en')

    expect(textOf(render([nationalToday()]))).toBe(
      'Today is a holiday in Campinas (Our Lady of Aparecida). Confirm with the customer before going.',
    )
  })

  test('nome com apóstrofo e & sai literal, sem entidade dupla nem HTML injetado', async () => {
    await i18n.changeLanguage('pt-BR')
    const warning: HolidayWarning = {
      ...nationalToday(),
      cityName: "Santa Bárbara d'Oeste",
      reasons: [{ name: '<b>Festa</b> & Cia', origin: 'typed', scope: 'municipal' }],
    }

    const html = render([warning])

    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;Festa&lt;/b&gt; &amp; Cia')
    expect(html).toContain('Santa Bárbara d&#x27;Oeste')
  })

  test.each([[undefined], [[]]])('sem aviso (%p) não renderiza nada', (warnings) => {
    expect(render(warnings)).toBe('')
  })

  test('aviso vencido (data passada) não renderiza nada', () => {
    expect(render([{ ...nationalToday(), date: '2026-10-11' }])).toBe('')
  })

  test('é informativo: nada clicável, desabilitado nem foco extra', () => {
    const html = render([nationalToday()])

    expect(html).not.toMatch(/<(button|a|input)\b/u)
    expect(html).not.toContain('disabled')
    expect(html).not.toContain('tabindex')
  })

  test('é acessível: região nomeada, ícone decorativo e uma linha por aviso', async () => {
    await i18n.changeLanguage('pt-BR')
    const html = render([nationalToday(), { ...nationalToday(), date: '2026-10-20' }])

    expect(html).toContain('aria-label="Aviso de feriado"')
    expect(html).toContain('aria-hidden="true"')
    expect(html.match(/<li\b/gu)).toHaveLength(2)
  })
})

describe('o aviso vem do snapshot guardado (spec 252 CA17)', () => {
  function createMemoryStore(): TripSnapshotStore {
    const records = new Map<string, StoredTripSnapshot>()
    let lastOwner: string | undefined
    return {
      clear: () => {
        records.clear()
        lastOwner = undefined
        return Promise.resolve()
      },
      read: (subHash) => Promise.resolve(records.get(subHash)),
      readLastOwner: () => Promise.resolve(lastOwner),
      remove: (subHash) => {
        records.delete(subHash)
        return Promise.resolve()
      },
      retainOnly: (subHash) => {
        for (const owner of [...records.keys()]) if (owner !== subHash) records.delete(owner)
        return Promise.resolve()
      },
      write: ({ record, subHash }) => {
        records.set(subHash, record)
        lastOwner = subHash
        return Promise.resolve()
      },
    }
  }

  function snapshotWith(holidayWarnings: readonly HolidayWarning[] | undefined) {
    return {
      isRegisteredDriver: true,
      pendingProofs: [],
      score: null,
      trips: [
        {
          createdAt: '2026-10-12T09:00:00.000Z',
          id: 'trip-1',
          manifest: null,
          status: 'in_transit',
          stops: [
            {
              arrivedAt: null,
              completedAt: null,
              deliveryProof: null,
              deliveryWindowEnd: null,
              deliveryWindowStart: null,
              documents: [],
              ...(holidayWarnings === undefined ? {} : { holidayWarnings }),
              id: 'stop-1',
              label: 'Campinas',
              latitude: null,
              longitude: null,
              schedule: null,
              sequence: 1,
            },
          ],
          vehiclePlate: 'ABC1D23',
        },
      ],
    }
  }

  test('sem rede, o último aviso conhecido sai do snapshot lido do aparelho', async () => {
    await i18n.changeLanguage('pt-BR')
    const store = createMemoryStore()
    const now = new Date('2026-10-12T15:00:00.000Z')
    await saveTripSnapshot({
      now,
      snapshot: snapshotWith([nationalToday()]),
      store,
      subHash: 'owner',
    })

    const restored = await readLastTripSnapshot({ now, store })
    const stop = restored?.snapshot.trips[0]?.stops[0]

    expect(textOf(render(stop?.holidayWarnings))).toContain('Hoje é feriado em Campinas')
  })

  test('snapshot antigo, sem o campo, abre a viagem sem aviso e sem erro', async () => {
    const store = createMemoryStore()
    const now = new Date('2026-10-12T15:00:00.000Z')
    await saveTripSnapshot({ now, snapshot: snapshotWith(undefined), store, subHash: 'owner' })

    const claimed = await claimTripSnapshot({ now, store, subHash: 'owner' })
    const stop = claimed?.snapshot.trips[0]?.stops[0]

    expect(stop).toBeDefined()
    expect(render(stop?.holidayWarnings)).toBe('')
  })
})

describe('encaixe no cartão da parada (spec 252 T5.4)', () => {
  const card = source('components/DriverStopCard.component.tsx')

  test('o cartão monta o aviso com o relógio corrigido pelo desvio', () => {
    expect(card).toContain('<DriverHolidayNotice')
    expect(card).toContain('warnings={stop.holidayWarnings}')
    expect(card).toContain('readCorrectedNowMs()')
  })

  test('o aviso fica fora do cabeçalho-botão e do corpo recolhido: aparece com o cartão fechado', () => {
    const noticeAt = card.indexOf('<DriverHolidayNotice')
    const headerEnd = card.indexOf('</h2>')
    const bodyStart = card.indexOf('<div className={styles.stopBody}')

    expect(noticeAt).toBeGreaterThan(headerEnd)
    expect(noticeAt).toBeLessThan(bodyStart)
  })

  test('nenhuma ação do cartão lê o aviso: nada some nem trava por feriado', () => {
    const mentions = card.match(/holidayWarnings/gu) ?? []

    expect(mentions).toHaveLength(1)
  })
})

describe('estilo do aviso (spec 252 T5.4)', () => {
  const css = source('styles/holidayNotice.module.css')

  test('texto na cor de tinta do tema, sem animação nem estilo inline', () => {
    expect(css).toContain('color: var(--color-fog)')
    expect(css).not.toMatch(/animation|transition|@keyframes/u)
    expect(source('components/DriverHolidayNotice.component.tsx')).not.toContain('style={')
  })

  test('palavras longas quebram em vez de empurrar a página além de 375 px', () => {
    expect(css).toContain('overflow-wrap: anywhere')
  })
})
