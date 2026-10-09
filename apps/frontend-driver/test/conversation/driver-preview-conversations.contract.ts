import { describe, expect, it } from 'bun:test'

import { createConversationRoutes } from '../../scripts/driver-preview-conversations'
import { createConversationRepository } from '../../scripts/driver-preview-conversations-repository'
import {
  PREVIEW_DOCUMENT_ID,
  PREVIEW_OCCURRENCE_IDS,
  PREVIEW_TRIP_ID,
} from '../../scripts/driver-preview-conversations-seed'

const DAMAGE = PREVIEW_OCCURRENCE_IDS.damage
const MESSAGES_PATH = `/v1/me/trips/current/occurrences/${DAMAGE}/messages`

function createRoutes() {
  const repository = createConversationRepository()
  const routes = createConversationRoutes({
    corsHeaders: {},
    officeReplyDelayMs: 0,
    port: 53901,
    repository,
  })
  const call = (
    method: string,
    path: string,
    init?: { body?: object; headers?: Record<string, string> },
  ) =>
    routes(
      new Request(`http://localhost:53901${path}`, {
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        headers: init?.headers ?? {},
        method,
      }),
      new URL(`http://localhost:53901${path}`),
    )
  return { call, repository }
}

describe('API de demonstração do motorista: conversas', () => {
  it('rota antiga: lista só as ocorrências, com não lidas só na de avaria', async () => {
    const { call } = createRoutes()
    const response = await call('GET', '/v1/me/trips/current/occurrence-conversations')
    const { data } = (await response?.json()) as {
      data: { occurrenceId: string; unreadCount: number }[]
    }
    expect(data).toHaveLength(6)
    expect(data.find((item) => item.occurrenceId === DAMAGE)?.unreadCount).toBe(2)
    expect(data.filter((item) => item.unreadCount > 0)).toHaveLength(1)
  })

  it('a mesma Idempotency-Key devolve a mesma resposta (200) sem criar outra mensagem', async () => {
    const { call, repository } = createRoutes()
    const send = () =>
      call('POST', MESSAGES_PATH, {
        body: { body: 'Três caixas.' },
        headers: { 'idempotency-key': 'key-1' },
      })
    const first = await send()
    const before = repository.messages(DAMAGE)?.length
    const second = await send()
    expect(first?.status).toBe(201)
    expect(second?.status).toBe(200)
    expect(await second?.json()).toEqual(await first?.json())
    expect(repository.messages(DAMAGE)?.length).toBe(before)
  })

  it('ler zera os não lidos (204)', async () => {
    const { call, repository } = createRoutes()
    const response = await call('POST', `${MESSAGES_PATH}/read`)
    expect(response?.status).toBe(204)
    expect(repository.list().every((item) => item.unreadCount === 0)).toBe(true)
  })

  it('fail-next derruba só os próximos N envios e a chave reenviada passa', async () => {
    const { call, repository } = createRoutes()
    await call('POST', '/__debug/conversations/fail-next', { body: { count: 1 } })
    const headers = { 'idempotency-key': 'key-2' }
    const failed = await call('POST', MESSAGES_PATH, { body: { body: 'a' }, headers })
    const retried = await call('POST', MESSAGES_PATH, { body: { body: 'a' }, headers })
    expect(failed?.status).toBe(503)
    expect(retried?.status).toBe(201)
    expect(repository.messages(DAMAGE)?.filter((message) => message.bodyText === 'a')).toHaveLength(
      1,
    )
  })

  it('reset volta ao estado inicial e office-reply injeta mensagem não lida', async () => {
    const { call, repository } = createRoutes()
    await call('POST', '/__debug/conversations/office-reply', {
      body: { subjectId: DAMAGE, text: 'Oi' },
    })
    expect(repository.list().find((item) => item.occurrenceId === DAMAGE)?.unreadCount).toBe(3)
    await call('POST', '/__debug/conversations/reset')
    expect(repository.list().find((item) => item.occurrenceId === DAMAGE)?.unreadCount).toBe(2)
  })

  it('upload em duas etapas devolve uploadId e URL, e o PUT fake aceita o arquivo', async () => {
    const { call } = createRoutes()
    const response = await call('POST', `/v1/me/trips/current/occurrences/${DAMAGE}/uploads`, {
      body: { contentType: 'image/png', fileName: 'foto.png', sizeBytes: 10 },
    })
    const { data } = (await response?.json()) as { data: { uploadId: string; uploadUrl: string } }
    const path = new URL(data.uploadUrl).pathname
    expect(response?.status).toBe(201)
    expect((await call('PUT', path))?.status).toBe(200)
  })

  it('rota nova: lista todos os assuntos com protocolo, canais e ícone', async () => {
    const { call } = createRoutes()
    const response = await call('GET', '/v1/me/trips/current/conversations')
    const { data, pagination } = (await response?.json()) as {
      data: {
        awaitingDriver: boolean
        channels: string[]
        iconName?: string
        protocol: string
        subjectId: string
        subjectLabel: string
        subjectType: string
      }[]
      pagination: { nextCursor: string | null }
    }
    expect(pagination).toEqual({ nextCursor: null })
    expect(data.map((item) => item.subjectType).sort()).toEqual([
      'document',
      'occurrence',
      'occurrence',
      'occurrence',
      'occurrence',
      'occurrence',
      'occurrence',
      'trip',
    ])
    expect(data.find((item) => item.subjectId === PREVIEW_DOCUMENT_ID)?.subjectLabel).toBe(
      'NF 4521 · Casa Verde',
    )
    expect(data.find((item) => item.subjectId === PREVIEW_TRIP_ID)?.subjectLabel).toBe(
      'Viagem de 09/10',
    )
    for (const item of data) expect(item.protocol).toMatch(/^\d{6}-[2-9A-HJKMNP-Z]{4}$/)
    expect(data.filter((item) => item.channels.length === 2)).toHaveLength(1)
    expect(
      data.filter((item) => item.iconName === undefined).map((item) => item.subjectType),
    ).toContain('trip')
    expect(new Set(data.flatMap((item) => (item.iconName ? [item.iconName] : []))).size).toBe(5)
  })

  it('rota nova: envia por assunto, devolve a mensagem com o eco e valida o tipo', async () => {
    const { call } = createRoutes()
    const path = `/v1/me/trips/current/conversations/document/${PREVIEW_DOCUMENT_ID}/messages`
    const sent = await call('POST', path, {
      body: { body: 'Confirmado' },
      headers: { 'idempotency-key': 'key-9' },
    })
    const { data } = (await sent?.json()) as { data: { clientMessageId: string; id: string } }
    expect(sent?.status).toBe(201)
    expect(data.clientMessageId).toBe('key-9')
    const listed = await call('GET', path)
    const { data: messages } = (await listed?.json()) as { data: { id: string }[] }
    expect(messages.at(-1)?.id).toBe(data.id)
    const wrongType = await call(
      'GET',
      `/v1/me/trips/current/conversations/trip/${PREVIEW_DOCUMENT_ID}/messages`,
    )
    expect(wrongType?.status).toBe(404)
    expect(((await wrongType?.json()) as { error: { code: string } }).error.code).toBe(
      'CONVERSATION_NOT_FOUND',
    )
  })
})
