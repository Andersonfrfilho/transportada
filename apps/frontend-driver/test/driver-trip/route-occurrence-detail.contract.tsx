/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, test } from 'bun:test'

import type { RouteOccurrenceView } from '@/modules/driver-trip/hooks/useRouteOccurrenceEntries.hook'
import { DriverOccurrenceDetailPage } from '@/modules/driver-trip/pages/DriverOccurrenceDetail.page'
import type { DriverRouteOccurrenceDetail } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import {
  resolveOccurrenceDetailState,
  type OccurrenceDetailState,
} from '@/modules/driver-trip/shared/occurrenceDetailState.service'
import { listRouteOccurrenceDocuments } from '@/modules/driver-trip/shared/routeOccurrenceDocuments.service'
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
    stopId: 'stop-2',
    stopSequence: 2,
    typeId: 'type-1',
    typeName: 'Avaria',
    unreadCount: 0,
    ...overrides,
  }
}

function buildDetail(
  overrides: Partial<DriverRouteOccurrenceDetail> = {},
): DriverRouteOccurrenceDetail {
  return {
    attachments: [],
    conversationExists: false,
    documentCount: 0,
    documentId: 'doc-1',
    documentNumber: '1001',
    id: 'occ-detail',
    kind: 'document',
    note: 'Duas caixas amassadas.',
    photos: [],
    recordedAt: '2026-10-15T14:32:00.000Z',
    recordedByMe: true,
    reopenedAt: null,
    reportKey: null,
    resolution: null,
    signature: null,
    state: 'open',
    stopId: 'stop-2',
    stopSequence: 2,
    timeline: [
      { at: '2026-10-15T14:32:00.000Z', kind: 'recorded' },
      { at: '2026-10-15T14:33:00.000Z', kind: 'photo' },
    ],
    type: { iconName: 'camera', id: 'type-1', name: 'Avaria' },
    ...overrides,
  }
}

const STOPS = [buildDriverTripStop({ id: 'stop-2', label: 'Mercado Sao Jorge', sequence: 2 })]

function buildView(entries: readonly RouteOccurrenceEntry[]): RouteOccurrenceView {
  return {
    entries,
    isFromSnapshot: false,
    listStatus: 'loaded',
    openCount: entries.length,
    savedAt: undefined,
    stopGroupById: new Map(),
    stopIdsWithOpenOccurrence: new Set(),
  }
}

function render(input: {
  entries?: readonly RouteOccurrenceEntry[]
  isUnreachable?: boolean
  state: OccurrenceDetailState
}): string {
  return renderToStaticMarkup(
    <DriverOccurrenceDetailPage
      isUnreachable={input.isUnreachable ?? false}
      state={input.state}
      stops={STOPS}
      view={buildView(input.entries ?? [])}
    />,
  )
}

const FILE_PDF = {
  contentType: 'application/pdf',
  name: 'boleto.pdf',
  objectId: 'o-pdf',
  sizeBytes: 84_000,
}
const FILE_JPG = { contentType: 'image/jpeg', name: null, objectId: 'o-jpg', sizeBytes: 1_300_000 }

describe('detalhe da ocorrência da rota (spec 266 T4.6)', () => {
  test('mostra tipo, estado e hora, e o botão que volta à parada', () => {
    const html = render({ state: { detail: buildDetail(), entry: entry(), status: 'ready' } })
    expect(html).toContain('Avaria')
    expect(html).toContain('Enviada')
    expect(html).toContain('Ver a nota na parada 2')
    expect(html).toContain('data-action="see-stop"')
  })

  test('resolvida pelo escritório mostra a observação interna', () => {
    const html = render({
      state: {
        detail: buildDetail({
          resolution: {
            actorKind: 'internal',
            at: '2026-10-15T15:10:00.000Z',
            note: 'Ressalva aceita.',
            phraseKey: null,
          },
          state: 'resolved',
        }),
        entry: entry({ resolutionNote: 'Ressalva aceita.', state: 'resolved' }),
        status: 'ready',
      },
    })
    expect(html).toContain('Resolvida pelo escritório às')
    expect(html).toContain('Ressalva aceita.')
  })

  test('resolvida pelo sistema mostra a frase fixa traduzida', () => {
    const html = render({
      state: {
        detail: undefined,
        entry: entry({ resolutionPhraseKey: 'case_returned_to_warehouse', state: 'resolved' }),
        status: 'ready',
      },
    })
    expect(html).toContain('Mercadoria devolvida ao armazém')
  })

  test('recusada mostra o motivo e "Corrigir e reenviar"', () => {
    const html = render({
      state: {
        detail: undefined,
        entry: entry({
          rejectionCause: 'Falta a foto da fachada.',
          source: 'queue',
          state: 'rejected',
        }),
        status: 'ready',
      },
    })
    expect(html).toContain('Recusada pelo escritório')
    expect(html).toContain('Falta a foto da fachada.')
    expect(html).toContain('Corrigir e reenviar')
  })

  /** Spec 270 (RF7): o servidor recusou o registro da fila porque o tipo mudou de escopo — texto humano, não o código cru. */
  test('recusada pelo escopo do tipo mostra o motivo em texto humano, não o código', () => {
    const html = render({
      state: {
        detail: undefined,
        entry: entry({
          rejectionCause: '422 OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR',
          source: 'queue',
          state: 'rejected',
        }),
        status: 'ready',
      },
    })
    expect(html).toContain('não vale para a contratante desta nota')
    expect(html).not.toContain('OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR')
    expect(html).toContain('Corrigir e reenviar')
  })

  test('o botão do chat leva a contagem de novas; resolvida vira "Ver conversa"', () => {
    const open = render({
      state: {
        detail: undefined,
        entry: entry({ hasConversation: true, unreadCount: 2 }),
        status: 'ready',
      },
    })
    const resolved = render({
      state: {
        detail: undefined,
        entry: entry({ hasConversation: true, state: 'resolved', unreadCount: 1 }),
        status: 'ready',
      },
    })
    const withoutChat = render({ state: { detail: undefined, entry: entry(), status: 'ready' } })
    expect(open).toContain('Abrir conversa · 2 novas')
    expect(resolved).toContain('Ver conversa · 1 nova')
    expect(withoutChat).not.toContain('conversa')
  })

  test('documentos: ver e compartilhar em cada um e "Compartilhar os N" com mais de um', () => {
    const detail = buildDetail({
      attachments: [{ ...FILE_PDF, messageId: 'm1' }],
      photos: [FILE_JPG],
    })
    const html = render({
      state: { detail, entry: entry({ hasDocument: true }), status: 'ready' },
    })
    expect(html).toContain('Documentos · 2')
    expect(html).toContain('aria-label="Ver boleto.pdf"')
    expect(html).toContain('aria-label="Compartilhar boleto.pdf"')
    expect(html).toContain('Compartilhar os 2')
  })

  test('resolvida: o boleto recebido pelo chat continua para ver e compartilhar', () => {
    const html = render({
      state: {
        detail: buildDetail({
          attachments: [{ ...FILE_PDF, messageId: 'm1' }],
          state: 'resolved',
        }),
        entry: entry({ hasConversation: true, hasDocument: true, state: 'resolved' }),
        status: 'ready',
      },
    })
    expect(html).toContain('aria-label="Ver boleto.pdf"')
    expect(html).toContain('aria-label="Compartilhar boleto.pdf"')
  })

  test('com um só documento não há "Compartilhar os N"', () => {
    const html = render({
      state: {
        detail: buildDetail({ photos: [FILE_JPG] }),
        entry: entry({ hasDocument: true }),
        status: 'ready',
      },
    })
    expect(html).toContain('Documentos · 1')
    expect(html).not.toContain('Compartilhar os')
  })

  test('sem rede os documentos ficam desligados e o painel explica', () => {
    const html = render({
      isUnreachable: true,
      state: {
        detail: undefined,
        entry: entry({ hasDocument: true }),
        status: 'ready',
      },
    })
    expect(html).toContain('Sem sinal: os documentos abrem quando o sinal voltar.')
  })

  test('sem rede, o detalhe já lido mantém os documentos mas desligados', () => {
    const html = render({
      isUnreachable: true,
      state: {
        detail: buildDetail({ photos: [FILE_JPG] }),
        entry: entry({ hasDocument: true }),
        status: 'ready',
      },
    })
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*aria-label="Ver photo-1.jpg"|aria-label="Ver photo-1.jpg"[^>]*disabled/,
    )
  })

  test('linha do tempo do servidor, na ordem, com hora', () => {
    const html = render({ state: { detail: buildDetail(), entry: entry(), status: 'ready' } })
    expect(html.indexOf('Você registrou')).toBeGreaterThan(-1)
    expect(html.indexOf('Você registrou')).toBeLessThan(html.indexOf('Foto anexada'))
  })

  test('item na fila mostra "Aguardando sinal para enviar" na linha do tempo', () => {
    const html = render({
      state: {
        detail: undefined,
        entry: entry({ source: 'queue', state: 'queued' }),
        status: 'ready',
      },
    })
    expect(html).toContain('Aguardando sinal para enviar')
  })

  test('outras da mesma nota vêm antes das da mesma parada', () => {
    const current = entry({ documentId: 'doc-1', id: 'cur' })
    const sameNote = entry({ documentId: 'doc-1', id: 'n1', typeName: 'MesmaNota' })
    const sameStop = entry({
      documentId: 'doc-9',
      documentNumber: '9009',
      id: 's1',
      typeName: 'MesmaParada',
    })
    const elsewhere = entry({
      documentId: 'doc-5',
      id: 'x1',
      stopId: 'stop-7',
      typeName: 'OutraParada',
    })
    const html = render({
      entries: [current, sameStop, sameNote, elsewhere],
      state: { detail: undefined, entry: current, status: 'ready' },
    })
    expect(html).toContain('Outras desta nota · NF 1001')
    expect(html).toContain('Outras desta parada')
    expect(html.indexOf('MesmaNota')).toBeLessThan(html.indexOf('MesmaParada'))
    expect(html).not.toContain('OutraParada')
  })

  test('ocorrência não encontrada e viagem encerrada têm mensagem própria', () => {
    expect(render({ state: { status: 'notFound' } })).toContain('Ocorrência não encontrada')
    expect(render({ state: { status: 'tripFinished' } })).toContain('Viagem encerrada')
    expect(render({ state: { status: 'loading' } })).toContain('Carregando a ocorrência')
    expect(render({ state: { status: 'offlineEmpty' } })).toContain('Sem sinal')
  })
})

describe('estado do detalhe e lista de documentos (spec 266 T4.6)', () => {
  test('o item da fila não consulta o servidor: vale a linha da lista', () => {
    const queued = entry({ source: 'queue', state: 'queued' })
    const state = resolveOccurrenceDetailState({
      isUnreachable: false,
      listedEntry: queued,
      result: { status: 'notFound' },
    })
    expect(state).toEqual({ detail: undefined, entry: queued, status: 'ready' })
  })

  test('lido: junta o detalhe à linha da lista, ou monta a linha quando a lista não a tem', () => {
    const detail = buildDetail({ id: 'occ-x' })
    const listed = entry({ id: 'occ-x', unreadCount: 4 })
    const withList = resolveOccurrenceDetailState({
      isUnreachable: false,
      listedEntry: listed,
      result: { data: detail, status: 'loaded' },
    })
    const withoutList = resolveOccurrenceDetailState({
      isUnreachable: false,
      listedEntry: undefined,
      result: { data: detail, status: 'loaded' },
    })
    expect(withList.status === 'ready' && withList.entry.unreadCount).toBe(4)
    expect(withoutList.status === 'ready' && withoutList.entry.id).toBe('occ-x')
  })

  test('404 do servidor: viagem encerrada e não encontrada', () => {
    expect(
      resolveOccurrenceDetailState({
        isUnreachable: false,
        listedEntry: undefined,
        result: { status: 'tripFinished' },
      }).status,
    ).toBe('tripFinished')
    expect(
      resolveOccurrenceDetailState({
        isUnreachable: false,
        listedEntry: undefined,
        result: { status: 'notFound' },
      }).status,
    ).toBe('notFound')
  })

  test('sem detalhe: a lista vale; sem a lista, carrega ou, sem rede, avisa', () => {
    const listed = entry()
    expect(
      resolveOccurrenceDetailState({ isUnreachable: true, listedEntry: listed, result: undefined })
        .status,
    ).toBe('ready')
    expect(
      resolveOccurrenceDetailState({
        isUnreachable: false,
        listedEntry: undefined,
        result: undefined,
      }).status,
    ).toBe('loading')
    expect(
      resolveOccurrenceDetailState({
        isUnreachable: true,
        listedEntry: undefined,
        result: undefined,
      }).status,
    ).toBe('offlineEmpty')
  })

  test('os documentos juntam fotos, assinatura e anexos sem repetir o objeto, e dão nome ao que não tem', () => {
    const documents = listRouteOccurrenceDocuments({
      attachments: [
        { ...FILE_PDF, messageId: 'm1' },
        { ...FILE_JPG, messageId: 'm2' },
      ],
      photos: [FILE_JPG],
      signature: { contentType: 'image/png', name: null, objectId: 'o-sig', sizeBytes: null },
    })
    expect(documents.map((document) => document.objectId)).toEqual(['o-jpg', 'o-sig', 'o-pdf'])
    expect(documents.map((document) => document.fileName)).toEqual([
      'photo-1.jpg',
      'signature-2.png',
      'boleto.pdf',
    ])
    expect(documents.map((document) => document.origin)).toEqual([
      'photo',
      'signature',
      'attachment',
    ])
  })
})
