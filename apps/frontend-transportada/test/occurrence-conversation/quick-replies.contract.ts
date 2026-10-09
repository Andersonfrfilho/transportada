/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T701 (RF12): as respostas rápidas. O cadastro mora em Configurações (aba própria); o
 * compositor de cada aba oferece as ativas daquele público e só **insere** o texto no rascunho — o
 * operador ainda edita antes de mandar (D4).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createQuickRepliesClient } from '@/modules/occurrence-conversation/shared/quickRepliesClient.service'
import {
  insertQuickReply,
  moveQuickReply,
  quickRepliesOf,
  validateQuickReplyDraft,
} from '@/modules/occurrence-conversation/shared/quickReplies.service'
import type { QuickReply } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'

const API_URL = 'https://api.transportada.test'

function reply(overrides: Partial<QuickReply> = {}): QuickReply {
  return {
    active: true,
    audience: 'contractor',
    id: 'reply-1',
    position: 0,
    text: 'Podem confirmar a autorização?',
    ...overrides,
  }
}

function createClient(responses: readonly Response[], requests: Request[]) {
  let index = 0
  return createQuickRepliesClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      const response = responses[index] ?? new Response(null, { status: 500 })
      index += 1
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

describe('o cliente das respostas rápidas (spec 183 T701)', () => {
  test('lista, cria, edita, reordena e lê as do compositor pelos caminhos da API', async () => {
    const requests: Request[] = []
    const list = Response.json({ data: [reply(), { broken: true }] })
    const client = createClient(
      [
        list,
        Response.json({ data: reply() }, { status: 201 }),
        Response.json({ data: reply({ active: false }) }),
        Response.json({ data: [reply()] }),
        Response.json({ data: [reply()] }),
      ],
      requests,
    )

    expect(await client.listAll()).toEqual([reply()])
    await client.create({ audience: 'driver', text: 'Pode descarregar.' })
    await client.update({ active: false, id: 'reply-1' })
    await client.reorder({ audience: 'contractor', ids: ['reply-1'] })
    await client.listForComposer('driver')

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${API_URL}/company-settings/quick-replies`,
      `POST ${API_URL}/company-settings/quick-replies`,
      `PATCH ${API_URL}/company-settings/quick-replies/reply-1`,
      `PUT ${API_URL}/company-settings/quick-replies/order`,
      `GET ${API_URL}/occurrence-quick-replies?audience=driver`,
    ])
    expect(await requests[1]?.json()).toEqual({ audience: 'driver', text: 'Pode descarregar.' })
    expect(await requests[2]?.json()).toEqual({ active: false })
    expect(await requests[3]?.json()).toEqual({ audience: 'contractor', ids: ['reply-1'] })
  })
})

describe('as respostas rápidas — serviço puro (spec 183 T701)', () => {
  test('o rascunho do cadastro sai aparado, e diz o que falta', () => {
    expect(validateQuickReplyDraft('  Recebemos.  ')).toEqual({ text: 'Recebemos.' })
    expect(validateQuickReplyDraft('   ')).toEqual({ error: 'required' })
    expect(validateQuickReplyDraft('x'.repeat(501))).toEqual({ error: 'tooLong' })
  })

  test('subir e descer trocam com a vizinha; nas pontas, nada muda', () => {
    expect(moveQuickReply(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moveQuickReply(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b'])
    expect(moveQuickReply(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c'])
    expect(moveQuickReply(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c'])
  })

  test('inserir põe o texto no rascunho vazio, ou numa linha nova depois do que já está', () => {
    expect(insertQuickReply('', 'Recebemos.')).toBe('Recebemos.')
    expect(insertQuickReply('   ', 'Recebemos.')).toBe('Recebemos.')
    expect(insertQuickReply('Bom dia.  ', 'Recebemos.')).toBe('Bom dia.\nRecebemos.')
  })

  test('cada aba vê as do seu público, na ordem gravada', () => {
    const replies = [
      reply({ id: 'c-2', position: 1 }),
      reply({ audience: 'driver', id: 'd-1' }),
      reply({ id: 'c-1', position: 0 }),
    ]

    expect(quickRepliesOf(replies, 'contractor').map((item) => item.id)).toEqual(['c-1', 'c-2'])
  })
})

describe('as respostas rápidas por texto de fonte (spec 183 T701)', () => {
  test('Configurações ganha a aba, com o painel autocontido do módulo dono', () => {
    const page = readFileSync('src/modules/company-settings/pages/CompanySettings.page.tsx', 'utf8')

    expect(page).toContain("tab === 'quickReplies'")
    expect(page).toContain('QuickRepliesSettingsPanel')
  })

  test('os compositores oferecem as respostas do público da aba', () => {
    const conversations = readFileSync(
      'src/modules/occurrence-conversation/components/OccurrenceConversations.component.tsx',
      'utf8',
    )
    const dialog = readFileSync(
      'src/modules/occurrence-conversation/components/SendToContractorDialog.component.tsx',
      'utf8',
    )

    expect(conversations).toMatch(/<QuickReplyPicker\s+audience="driver"/u)
    expect(conversations).toMatch(/<QuickReplyPicker\s+audience="contractor"/u)
    expect(dialog).toMatch(/<QuickReplyPicker\s+audience="contractor"/u)
  })
})

describe('as respostas prontas do motorista (spec 260 T5.2-A, D11)', () => {
  test('o cliente aceita o público driver_reply e o cadastro o envia à API', async () => {
    const requests: Request[] = []
    const client = createClient(
      [
        Response.json({ data: [reply({ audience: 'driver_reply', id: 'dr-1' })] }),
        Response.json({ data: reply({ audience: 'driver_reply' }) }, { status: 201 }),
      ],
      requests,
    )

    expect((await client.listAll()).map((item) => item.audience)).toEqual(['driver_reply'])
    await client.create({ audience: 'driver_reply', text: 'Cheguei ao destino.' })

    expect(await requests[1]?.json()).toEqual({
      audience: 'driver_reply',
      text: 'Cheguei ao destino.',
    })
  })

  test('o público de motorista não se mistura com o do escritório ao motorista', () => {
    const replies = [
      reply({ audience: 'driver', id: 'office-to-driver' }),
      reply({ audience: 'driver_reply', id: 'driver-reply' }),
    ]

    expect(quickRepliesOf(replies, 'driver_reply').map((item) => item.id)).toEqual(['driver-reply'])
    expect(quickRepliesOf(replies, 'driver').map((item) => item.id)).toEqual(['office-to-driver'])
  })

  test('o painel de Configurações tem a seção do motorista, com textos nos dois idiomas', () => {
    const panel = readFileSync(
      'src/modules/occurrence-conversation/components/QuickRepliesSettingsPanel.component.tsx',
      'utf8',
    )
    const base = 'src/modules/occurrence-conversation/locales/occurrenceConversation'
    expect(panel).toMatch(/AUDIENCES[^=]*=\s*\['contractor', 'driver', 'driver_reply'\]/u)

    for (const file of [`${base}.locale.json`, `${base}.en.locale.json`]) {
      const { quickReplies } = JSON.parse(readFileSync(file, 'utf8')) as {
        quickReplies: { audience: Record<string, string>; new: Record<string, string> }
      }
      expect(quickReplies.audience.driver_reply).toBeString()
      expect(quickReplies.new.driver_reply).toBeString()
    }
  })

  test('o fio por assunto oferece as respostas do escritório ao motorista como chips do SDK (que só preenchem)', () => {
    const composer =
      readFileSync(
        'src/modules/occurrence-conversation/components/SubjectConversationPanel.component.tsx',
        'utf8',
      ) +
      readFileSync('src/modules/occurrence-conversation/shared/useSubjectThread.hook.ts', 'utf8')
    const conversations = readFileSync(
      'src/modules/occurrence-conversation/components/OccurrenceConversations.component.tsx',
      'utf8',
    )

    expect(composer).toContain("useComposerQuickRepliesQuery('driver')")
    expect(composer).toContain('quickReplies={threadQuickReplies}')
    expect(conversations).not.toContain('driver_reply')
  })
})
