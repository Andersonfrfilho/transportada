/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, test } from 'bun:test'

import { DriverOccurrenceAlertButton } from '@/modules/driver-trip/components/DriverOccurrenceAlertButton.component'
import { DriverOccurrenceBadgeIcon } from '@/modules/driver-trip/components/DriverOccurrenceBadgeIcon.component'
import { DriverOccurrenceStopRow } from '@/modules/driver-trip/components/DriverOccurrenceStopRow.component'
import { DriverTripProgress } from '@/modules/driver-trip/components/DriverTripProgress.component'
import type {
  RouteOccurrenceEntry,
  RouteOccurrenceStopGroup,
} from '@/modules/driver-trip/shared/routeOccurrenceView.types'
import { groupRouteOccurrencesByStop } from '@/modules/driver-trip/shared/routeOccurrenceView.service'
import { i18n } from '@/modules/shared/i18n/i18n.service'

import { buildDriverTripDocument, buildDriverTripStop } from '../fixtures/driverTrip.fixture'

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR')
})

let sequence = 0
function entry(overrides: Partial<RouteOccurrenceEntry> = {}): RouteOccurrenceEntry {
  sequence += 1
  return {
    documentId: 'doc-1',
    documentNumber: '1001',
    hasConversation: false,
    hasDocument: false,
    iconName: 'camera',
    id: `occ-${sequence}`,
    isReopened: false,
    kind: 'document',
    recordedAt: new Date(Date.UTC(2026, 9, 15, 10, sequence)).toISOString(),
    rejectionCause: undefined,
    resolutionNote: undefined,
    resolutionPhraseKey: undefined,
    source: 'server',
    state: 'open',
    stopId: 'stop-1',
    stopSequence: 1,
    typeId: 'type-1',
    typeName: 'Avaria',
    unreadCount: 0,
    ...overrides,
  }
}

function groupOf(entries: readonly RouteOccurrenceEntry[]): RouteOccurrenceStopGroup {
  const [group] = groupRouteOccurrencesByStop(entries)
  if (group === undefined) throw new Error('GROUP_EXPECTED')
  return group
}

describe('alerta de ocorrências em aberto no cabeçalho (spec 266 T4.4)', () => {
  test('zero não renderiza nada', () => {
    expect(renderToStaticMarkup(<DriverOccurrenceAlertButton count={0} />)).toBe('')
  })

  test('uma: botão com rótulo no singular e selo 1', () => {
    const html = renderToStaticMarkup(<DriverOccurrenceAlertButton count={1} />)
    expect(html).toContain('<button')
    expect(html).toContain('aria-label="1 ocorrência em aberto"')
    expect(html).toContain('>1</span>')
  })

  test('várias: rótulo no plural e selo com o número', () => {
    const html = renderToStaticMarkup(<DriverOccurrenceAlertButton count={7} />)
    expect(html).toContain('aria-label="7 ocorrências em aberto"')
    expect(html).toContain('>7</span>')
  })
})

describe('ícone da ocorrência com selos (spec 266 T4.4)', () => {
  test('rótulo compõe tipo, estado, hora, mensagens e documentos', () => {
    const html = renderToStaticMarkup(
      <DriverOccurrenceBadgeIcon entry={entry({ hasDocument: true, unreadCount: 2 })} />,
    )
    expect(html).toMatch(
      /aria-label="Avaria · Enviada · às \d{1,2}:\d{2}(?: [AP]M)? · 2 mensagens novas · com documento"/u,
    )
    expect(html).toContain('data-state="open"')
    expect(html).toContain('>2</span>')
  })

  test.each([
    ['queued', 'Na fila'],
    ['rejected', 'Recusada'],
    ['resolved', 'Resolvida'],
    ['cancelled', 'Cancelada'],
    ['open', 'Enviada'],
  ] as const)('estado %s diz "%s"', (state, label) => {
    const html = renderToStaticMarkup(<DriverOccurrenceBadgeIcon entry={entry({ state })} />)
    expect(html).toContain(` · ${label} · `)
    expect(html).toContain(`data-state="${state}"`)
  })

  test('sem não lidas e sem documento não há selo de mensagem nem clipe', () => {
    const html = renderToStaticMarkup(<DriverOccurrenceBadgeIcon entry={entry()} />)
    expect(html).not.toContain('mensagem')
    expect(html).not.toContain('documento')
    expect(html).not.toContain('data-badge="documents"')
  })

  test('ícone ausente ou fora do catálogo cai no alerta; tipo da fila sem nome usa "Ocorrência"', () => {
    const html = renderToStaticMarkup(
      <DriverOccurrenceBadgeIcon entry={entry({ iconName: 'sun', typeName: null })} />,
    )
    expect(html).toContain('aria-label="Ocorrência · Enviada')
    expect(html).toContain('M12 3.5 2.7 19.5')
  })

  test('o alvo é um botão de 44px que leva ao detalhe', () => {
    const html = renderToStaticMarkup(<DriverOccurrenceBadgeIcon entry={entry()} />)
    expect(html).toStartWith('<button')
    expect(html).toContain('type="button"')
  })
})

describe('fileira de ocorrências por nota na parada (spec 266 T4.4)', () => {
  test('uma nota com duas do mesmo tipo: rótulo da nota, contador 2 e dois ícones', () => {
    const html = renderToStaticMarkup(
      <DriverOccurrenceStopRow group={groupOf([entry(), entry()])} />,
    )
    expect(html).toContain('NF 1001')
    expect(html).toContain('data-note-count="2"')
    expect(html.match(/<button/gu)).toHaveLength(2)
  })

  test('uma só na nota não mostra contador', () => {
    const html = renderToStaticMarkup(<DriverOccurrenceStopRow group={groupOf([entry()])} />)
    expect(html).not.toContain('data-note-count')
  })

  test('notas diferentes viram grupos separados, e a de parada tem o seu', () => {
    const html = renderToStaticMarkup(
      <DriverOccurrenceStopRow
        group={groupOf([
          entry(),
          entry({ documentId: 'doc-2', documentNumber: '1002' }),
          entry({ documentId: null, documentNumber: null, kind: 'stop' }),
        ])}
      />,
    )
    expect(html).toContain('NF 1001')
    expect(html).toContain('NF 1002')
    expect(html).toContain('data-group="stop"')
    expect(html).toContain('>Parada<')
  })

  test('acima de 4 mostra 3 ícones e o "+N" que abre a lista filtrada pela nota', () => {
    const entries = Array.from({ length: 6 }, () => entry())
    const html = renderToStaticMarkup(<DriverOccurrenceStopRow group={groupOf(entries)} />)
    expect(html.match(/data-occurrence-icon/gu)).toHaveLength(3)
    expect(html).toContain('>+3</button>')
    expect(html).toContain('data-more-filter="note:doc-1"')
  })

  test('com exatamente 4 não corta', () => {
    const entries = Array.from({ length: 4 }, () => entry())
    const html = renderToStaticMarkup(<DriverOccurrenceStopRow group={groupOf(entries)} />)
    expect(html.match(/data-occurrence-icon/gu)).toHaveLength(4)
    expect(html).not.toContain('data-more-filter')
  })

  test('o "+N" das de parada filtra pela parada', () => {
    const entries = Array.from({ length: 5 }, () =>
      entry({ documentId: null, documentNumber: null, kind: 'stop' }),
    )
    const html = renderToStaticMarkup(<DriverOccurrenceStopRow group={groupOf(entries)} />)
    expect(html).toContain('data-more-filter="stop:stop-1"')
  })
})

describe('barra de progresso com ocorrência em aberto (spec 266 T4.4)', () => {
  const trip = {
    stops: [
      buildDriverTripStop({
        documents: [buildDriverTripDocument({ id: 'd1' })],
        id: 'stop-1',
        sequence: 1,
      }),
      buildDriverTripStop({
        documents: [buildDriverTripDocument({ id: 'd2' })],
        id: 'stop-2',
        sequence: 2,
      }),
    ],
  } as unknown as Parameters<typeof DriverTripProgress>[0]['trip']

  test('só o segmento da parada com ocorrência em aberto ganha o estado de alerta', () => {
    const html = renderToStaticMarkup(
      <DriverTripProgress stopIdsWithOpenOccurrence={new Set(['stop-2'])} trip={trip} />,
    )
    expect(html.match(/data-has-occurrence="true"/gu)).toHaveLength(1)
  })

  test('sem o conjunto o markup não tem o atributo', () => {
    const html = renderToStaticMarkup(<DriverTripProgress trip={trip} />)
    expect(html).not.toContain('data-has-occurrence')
  })
})
