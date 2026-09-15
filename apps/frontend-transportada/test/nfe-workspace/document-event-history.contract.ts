/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createNfeDocumentEventClient } from '../../src/modules/nfe-workspace/shared/nfeDocumentEventClient.service'
import {
  actorDisplayLabelKey,
  describeNfeEventActors,
  describeNfeEventOrigin,
  describeNfeEventStatus,
  describeNfeEventType,
} from '../../src/modules/nfe-workspace/shared/nfeDocumentEventHistory.service'
import locale from '../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
import englishLocale from '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const DRAWER_PATH =
  'src/modules/nfe-workspace/components/NfeDocumentEventHistoryDrawer.component.tsx'
const TABLE_PATH = 'src/modules/nfe-workspace/components/NfeDocumentTable.component.tsx'
const HOOK_PATH = 'src/modules/nfe-workspace/hooks/useNfeDocumentEventHistory.hook.ts'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const NAMED_ACTOR = { id: 'user-1', name: 'Ana Operadora' } as const
const REMOVED_ACTOR = { removed: true } as const

const CANCELLATION_EVENT = {
  actor: NAMED_ACTOR,
  correctionText: null,
  eventType: '110111',
  id: 'event-1',
  kind: 'event' as const,
  occurredAt: '2026-09-10T12:00:00.000Z',
  origin: 'manual' as const,
  protocol: '135250000000001',
  registeredAt: '2026-09-10T12:00:01.000000Z',
  requestedBy: null,
  sequence: '1',
  statusAfter: 'cancelled' as const,
  statusBefore: 'authorized' as const,
  statusCode: '135',
}

async function listWith(items: readonly unknown[], page: unknown = { nextCursor: null }) {
  const client = createNfeDocumentEventClient({
    apiUrl: 'https://api.example.test',
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ data: items, page }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      ),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
  return client.listDocumentEvents({ cursor: null, documentId: 'document-1', limit: 20 })
}

describe('cliente de histórico fiscal da nota (spec 149 H4)', () => {
  test('lê a página no envelope real da H3 (data + page.nextCursor)', async () => {
    const page = await listWith([CANCELLATION_EVENT], { nextCursor: 'cursor-1' })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.eventType).toBe('110111')
    expect(page.nextCursor).toBe('cursor-1')
  })

  test('recusa entrada fora do formato conhecido em vez de renderizar dado cru', () => {
    expect(listWith([{ id: 'broken' }])).rejects.toThrow('NFE_DOCUMENT_EVENT_RESPONSE_INVALID')
  })

  test('erro da API vira o código do envelope de erro', () => {
    const client = createNfeDocumentEventClient({
      apiUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'NFE_DOCUMENT_NOT_FOUND' } }), {
            headers: { 'content-type': 'application/json' },
            status: 404,
          }),
        ),
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })
    expect(
      client.listDocumentEvents({ cursor: null, documentId: 'other-company-document', limit: 20 }),
    ).rejects.toThrow('NFE_DOCUMENT_NOT_FOUND')
  })

  test('aceita ator/solicitante como { removed: true }, distinto de ausente (spec 149 H13)', async () => {
    const page = await listWith([
      { ...CANCELLATION_EVENT, actor: { removed: true }, requestedBy: { removed: true } },
    ])
    expect(page.items[0]?.actor).toEqual({ removed: true })
    expect(page.items[0]?.requestedBy).toEqual({ removed: true })
  })

  test('entrada sem evento (mudança de situação) e ator ausente também são aceitos', async () => {
    const statusChange = {
      actor: null,
      correctionText: null,
      eventType: null,
      id: 'status-change-1',
      kind: 'statusChange' as const,
      occurredAt: null,
      origin: 'automatic' as const,
      protocol: null,
      registeredAt: '2026-09-10T11:00:00.000000Z',
      requestedBy: null,
      sequence: null,
      statusAfter: 'cancelled' as const,
      statusBefore: null,
      statusCode: null,
    }
    const page = await listWith([statusChange])
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.statusBefore).toBeNull()
  })
})

describe('tipo do evento em pt-BR (D13/D20)', () => {
  test('cada código de evento reconhecido tem rótulo próprio', () => {
    expect(describeNfeEventType({ eventType: '110111', kind: 'event' }).key).toBe(
      'documents.eventHistory.eventType.cancellation',
    )
    expect(describeNfeEventType({ eventType: '110112', kind: 'event' }).key).toBe(
      'documents.eventHistory.eventType.cancellationSubstitution',
    )
    expect(describeNfeEventType({ eventType: '110110', kind: 'event' }).key).toBe(
      'documents.eventHistory.eventType.correction',
    )
    expect(describeNfeEventType({ eventType: '210200', kind: 'event' }).key).toBe(
      'documents.eventHistory.eventType.manifestConfirmation',
    )
  })

  test('mudança de situação sem evento tem rótulo próprio, e código desconhecido mostra o código cru', () => {
    expect(describeNfeEventType({ eventType: null, kind: 'statusChange' }).key).toBe(
      'documents.eventHistory.eventType.statusChange',
    )
    const unknown = describeNfeEventType({ eventType: '999999', kind: 'event' })
    expect(unknown.key).toBe('documents.eventHistory.eventType.unknown')
    expect(unknown.code).toBe('999999')
  })

  test('status ausente (D17) não é recalculado: rótulo próprio de "não registrado"', () => {
    expect(describeNfeEventStatus(null)).toBe('documents.eventHistory.statusUnknown')
    expect(describeNfeEventStatus('authorized')).toBe('documentStatus.authorized')
    expect(describeNfeEventStatus('unsigned')).toBe('documentStatus.unsigned')
  })

  test('origem tem rótulo pt-BR para os três valores possíveis', () => {
    expect(describeNfeEventOrigin('manual')).toBe('documents.eventHistory.origin.manual')
    expect(describeNfeEventOrigin('automatic')).toBe('documents.eventHistory.origin.automatic')
    expect(describeNfeEventOrigin('unknown')).toBe('documents.eventHistory.origin.unknown')
  })
})

describe('quem fez / quem solicitou (D14/D16)', () => {
  test('manual mostra só "quem fez"; sem membership ativa é "usuário removido"', () => {
    const withActor = describeNfeEventActors({
      actor: NAMED_ACTOR,
      origin: 'manual',
      requestedBy: null,
    })
    expect(withActor.actor).toEqual({ kind: 'named', name: 'Ana Operadora' })
    expect(withActor.requestedBy).toBeNull()

    const removedActor = describeNfeEventActors({
      actor: REMOVED_ACTOR,
      origin: 'manual',
      requestedBy: null,
    })
    expect(removedActor.actor).toEqual({ kind: 'removed' })
    expect(actorDisplayLabelKey({ kind: 'removed' })).toBe('documents.eventHistory.actorRemoved')
  })

  test('automática mostra só "quem solicitou"; sem solicitante resolvido é a distribuição agendada', () => {
    const requested = describeNfeEventActors({
      actor: null,
      origin: 'automatic',
      requestedBy: NAMED_ACTOR,
    })
    expect(requested.actor).toBeNull()
    expect(requested.requestedBy).toEqual({ kind: 'named', name: 'Ana Operadora' })

    const scheduled = describeNfeEventActors({
      actor: null,
      origin: 'automatic',
      requestedBy: null,
    })
    expect(scheduled.requestedBy).toEqual({ kind: 'system' })
    expect(actorDisplayLabelKey({ kind: 'system' })).toBe('documents.eventHistory.actorSystem')
  })

  /**
   * O defeito que esta task corrige: antes, `requestedBy: null` cobria tanto "ninguém pediu" quanto
   * "o solicitante saiu da empresa", e a tela mostrava "Sistema" para os dois. Com `{ removed: true
   * }` explícito da API, o automático com solicitante removido mostra "usuário removido".
   */
  test('automática com solicitante removido mostra "usuário removido", nunca "Sistema"', () => {
    const removedRequester = describeNfeEventActors({
      actor: null,
      origin: 'automatic',
      requestedBy: REMOVED_ACTOR,
    })
    expect(removedRequester.requestedBy).toEqual({ kind: 'removed' })
    expect(actorDisplayLabelKey({ kind: 'removed' })).toBe('documents.eventHistory.actorRemoved')
  })

  test('origem desconhecida (evento anterior à spec) não mostra ator nem solicitante', () => {
    const legacy = describeNfeEventActors({ actor: null, origin: 'unknown', requestedBy: null })
    expect(legacy.actor).toBeNull()
    expect(legacy.requestedBy).toBeNull()
  })
})

describe('drawer "Histórico fiscal" (D20)', () => {
  test('é um diálogo modal, portalizado, que fecha por teclado e devolve o foco à linha', async () => {
    const drawer = await readApplicationFile(DRAWER_PATH)

    expect(drawer).toContain('createPortal(')
    expect(drawer).toContain('document.body')
    expect(drawer).toContain('useModalDialog')
    expect(drawer).toContain('aria-modal="true"')
    expect(drawer).toContain('role="dialog"')
  })

  test('a linha do tempo é uma lista ordenada com data/hora semântica', async () => {
    const drawer = await readApplicationFile(DRAWER_PATH)

    expect(drawer).toContain('<ol')
    expect(drawer).toContain('<time')
    expect(drawer).toContain('dateTime=')
  })

  test('status anterior/novo não depende só de cor: texto e ícone', async () => {
    const drawer = await readApplicationFile(DRAWER_PATH)

    expect(drawer).toContain('describeNfeEventStatus')
    expect(drawer).toContain('<Icon name="chevron-right"')
  })

  test('"carregar mais" anuncia o estado de carregamento (aria-live)', async () => {
    const drawer = await readApplicationFile(DRAWER_PATH)

    expect(drawer).toContain('aria-live="polite"')
    expect(drawer).toContain('eventHistory.loadMore')
    expect(drawer).toContain('eventHistory.loadingMore')
  })

  test('estados vazio e de erro têm texto próprio', async () => {
    const drawer = await readApplicationFile(DRAWER_PATH)

    expect(drawer).toContain('eventHistory.empty')
    expect(drawer).toContain('eventHistory.error')
    expect(drawer).toContain('role="alert"')
  })

  test('a tabela abre o drawer pela linha, com ícone e paginação por cursor no hook', async () => {
    const [table, hook] = await Promise.all([
      readApplicationFile(TABLE_PATH),
      readApplicationFile(HOOK_PATH),
    ])

    expect(table).toContain('NfeDocumentEventHistoryDrawer')
    expect(table).toContain('eventHistory.open(')
    expect(table).toContain('<Icon name="clock"')
    expect(hook).toContain('useInfiniteQuery')
    expect(hook).toContain('getNextPageParam')
  })

  test('os textos do drawer existem em pt-BR e em inglês', () => {
    for (const source of [locale, englishLocale]) {
      expect(source.documents.eventHistoryButton).toBeString()
      expect(source.documents.eventHistory.title).toBeString()
      expect(source.documents.eventHistory.empty).toBeString()
      expect(source.documents.eventHistory.error).toBeString()
      expect(source.documents.eventHistory.actorRemoved).toBeString()
      expect(source.documents.eventHistory.actorSystem).toBeString()
      expect(source.documents.eventHistory.correctionText).toBeString()
    }
    expect(locale.documentStatus.unsigned).toBeString()
    expect(englishLocale.documentStatus.unsigned).toBeString()
  })
})
