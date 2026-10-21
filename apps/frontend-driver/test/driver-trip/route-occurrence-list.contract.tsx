/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, test } from 'bun:test'

import type { RouteOccurrenceView } from '@/modules/driver-trip/hooks/useRouteOccurrenceEntries.hook'
import { DriverRouteOccurrencesPage } from '@/modules/driver-trip/pages/DriverRouteOccurrences.page'
import {
  scopeRouteOccurrences,
} from '@/modules/driver-trip/shared/routeOccurrenceView.service'
import type { RouteOccurrenceEntry } from '@/modules/driver-trip/shared/routeOccurrenceView.types'
import { i18n } from '@/modules/shared/i18n/i18n.service'

import { buildDriverTripStop } from '../fixtures/driverTrip.fixture'

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

function buildView(
  entries: readonly RouteOccurrenceEntry[],
  overrides: Partial<RouteOccurrenceView> = {},
): RouteOccurrenceView {
  return {
    entries,
    isFromSnapshot: false,
    listStatus: 'loaded',
    openCount: entries.length,
    savedAt: undefined,
    stopGroupById: new Map(),
    stopIdsWithOpenOccurrence: new Set(),
    ...overrides,
  }
}

const STOPS = [
  buildDriverTripStop({ id: 'stop-1', label: 'Loja Alvorada', sequence: 1 }),
  buildDriverTripStop({ id: 'stop-2', label: 'Mercado Sao Jorge', sequence: 2 }),
]

function render(input: {
  entries?: readonly RouteOccurrenceEntry[]
  isOffline?: boolean
  scope?: { documentId?: string; stopId?: string }
  view?: Partial<RouteOccurrenceView>
}): string {
  return renderToStaticMarkup(
    <DriverRouteOccurrencesPage
      isOffline={input.isOffline ?? false}
      scope={input.scope ?? {}}
      stops={STOPS}
      view={buildView(input.entries ?? [], input.view)}
    />,
  )
}

describe('lista das ocorrências da rota (spec 266 T4.5)', () => {
  test('em aberto vem antes das resolvidas e canceladas', () => {
    const html = render({
      entries: [
        entry({ state: 'resolved', typeName: 'Resolvida X' }),
        entry({ state: 'open', typeName: 'Aberta Y' }),
        entry({ state: 'cancelled', typeName: 'Cancelada Z' }),
      ],
    })
    expect(html.indexOf('Em aberto')).toBeGreaterThan(-1)
    expect(html.indexOf('Em aberto')).toBeLessThan(html.indexOf('Resolvidas e canceladas'))
    expect(html.indexOf('Aberta Y')).toBeLessThan(html.indexOf('Resolvida X'))
    expect(html.indexOf('Aberta Y')).toBeLessThan(html.indexOf('Cancelada Z'))
  })

  test('os filtros por ícone levam a contagem no rótulo acessível', () => {
    const html = render({
      entries: [
        entry({ hasDocument: true, unreadCount: 2 }),
        entry({ state: 'rejected' }),
        entry({ state: 'queued' }),
        entry({ state: 'queued' }),
      ],
    })
    expect(html).toContain('aria-label="Todas: 4"')
    expect(html).toContain('aria-label="Com mensagem nova: 1"')
    expect(html).toContain('aria-label="Com documento: 1"')
    expect(html).toContain('aria-label="Recusadas: 1"')
    expect(html).toContain('aria-label="Na fila: 2"')
  })

  test('o filtro por nota mostra só as dela, com o aviso e "Ver todas"', () => {
    const html = render({
      entries: [
        entry({ documentId: 'doc-1', documentNumber: '1001', typeName: 'Da nota 1001' }),
        entry({ documentId: 'doc-2', documentNumber: '2002', typeName: 'Da nota 2002' }),
      ],
      scope: { documentId: 'doc-2' },
    })
    expect(html).toContain('Da nota 2002')
    expect(html).not.toContain('Da nota 1001')
    expect(html).toContain('NF 2002')
    expect(html).toContain('Ver todas')
    expect(html).toContain('aria-label="Todas: 1"')
  })

  test('o filtro por parada mostra só as de parada daquela parada', () => {
    const scoped = scopeRouteOccurrences({
      entries: [
        entry({ documentId: null, kind: 'stop', stopId: 'stop-2' }),
        entry({ documentId: 'doc-1', stopId: 'stop-2' }),
        entry({ documentId: null, kind: 'stop', stopId: 'stop-1' }),
      ],
      scope: { stopId: 'stop-2' },
    })
    expect(scoped).toHaveLength(1)
    expect(scoped[0]?.documentId).toBeNull()
    expect(scoped[0]?.stopId).toBe('stop-2')
  })

  test('a linha mostra NF, parada e destinatário', () => {
    const html = render({
      entries: [entry({ documentNumber: '4821', stopId: 'stop-2', stopSequence: 2 })],
    })
    expect(html).toContain('NF 4821 · P2 · Mercado Sao Jorge')
  })

  test('a linha sempre abre o detalhe e a conversa fica num botão à parte', () => {
    const withChat = entry({ hasConversation: true, id: 'occ-chat' })
    const withoutChat = entry({ id: 'occ-plain' })
    const queued = entry({ hasConversation: true, id: 'key-1', source: 'queue', state: 'queued' })
    expect(render({ entries: [withChat] })).toContain('Abre a conversa')
    expect(render({ entries: [withoutChat] })).not.toContain('Abre a conversa')
    expect(render({ entries: [queued] })).not.toContain('Abre a conversa')
    const html = render({ entries: [withChat, withoutChat] })
    expect(html).not.toContain('data-target="conversation"')
    expect(html).toContain('data-target="detail"')
  })

  test('o botão de compartilhar só aparece na linha com documento', () => {
    const withDocuments = render({ entries: [entry({ hasDocument: true })] })
    const withoutDocuments = render({ entries: [entry({ hasDocument: false })] })
    expect(withDocuments).toContain('Compartilhar documentos de Avaria')
    expect(withoutDocuments).not.toContain('Compartilhar documentos de Avaria')
  })

  test('mensagens novas aparecem no ícone de chat da linha', () => {
    const html = render({ entries: [entry({ hasConversation: true, unreadCount: 3 })] })
    expect(html).toContain('3 mensagens novas')
  })

  test('viagem encerrada mostra a mensagem e nenhuma lista', () => {
    const html = render({ view: { listStatus: 'tripFinished' } })
    expect(html).toContain('Viagem encerrada')
    expect(html).not.toContain('Todas')
  })

  test('sem dado ainda: carregando; sem sinal e sem nada: aviso de sem sinal', () => {
    expect(render({ view: { listStatus: 'loading' } })).toContain('Carregando as ocorrências')
    expect(render({ isOffline: true, view: { listStatus: 'loading' } })).toContain(
      'Sem sinal e sem nada guardado',
    )
  })

  test('o retrato do aparelho avisa que é o que estava guardado', () => {
    const html = render({
      entries: [entry()],
      view: { isFromSnapshot: true, savedAt: '2026-10-15T15:00:00.000Z' },
    })
    expect(html).toContain('Sem sinal: mostrando o que o aparelho guardou')
  })

  test('lista vazia da viagem diz que não há ocorrências', () => {
    expect(render({ entries: [] })).toContain('Nenhuma ocorrência nesta viagem.')
  })
})
