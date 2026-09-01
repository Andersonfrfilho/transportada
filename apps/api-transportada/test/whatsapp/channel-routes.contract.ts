/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { WhatsAppChannelSummary } from '../../src/whatsapp/application/whatsapp-channel.port.js'
import { createWhatsAppChannelRoutes } from '../../src/whatsapp/presentation/whatsapp-channel.routes.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const PATH = '/company-settings/whatsapp-channel'
const ACCESS_TOKEN = 'EAAG-token-secreto-da-meta'

const SETTINGS_PERMISSIONS: CompanyContext['permissions'] = new Set(['settings.manage'] as const)

const CHANNEL: WhatsAppChannelSummary = {
  createdAt: '2026-08-28T12:00:00.000Z',
  displayPhoneNumber: '5516999998888',
  id: '00000000-0000-4000-8000-000000000030',
  phoneNumberId: '123456789012345',
  status: 'active',
  tokenConfigured: true,
  updatedAt: '2026-08-28T12:00:00.000Z',
  version: '1',
  wabaId: '987654321098765',
}

function createFixture(
  input: {
    readonly channel?: WhatsAppChannelSummary | null
    readonly permissions?: CompanyContext['permissions']
  } = {},
) {
  const calls: Record<string, unknown[]> = { read: [], remove: [], save: [] }

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? SETTINGS_PERMISSIONS),
      routes: createWhatsAppChannelRoutes({
        readChannel: {
          async execute(request) {
            calls.read?.push(structuredClone(request))
            return input.channel === undefined ? CHANNEL : input.channel
          },
        },
        removeChannel: {
          async execute(request) {
            calls.remove?.push(structuredClone(request))
          },
        },
        saveChannel: {
          async execute(request) {
            calls.save?.push(structuredClone(request))
            return CHANNEL
          },
        },
      }),
    }),
  })

  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('as rotas do canal de WhatsApp (spec 062 T003)', () => {
  /**
   * ⚠️ **O token não volta, nem mascarado.** Máscara que permite confirmar um token é confirmação:
   * quem tem o começo e o fim reconhece o segredo que vazou por outro caminho. Este teste compara as
   * chaves **por extenso** — campo novo no resumo não escapa para a resposta sem alguém decidir.
   */
  test('a leitura publica lista fechada, e nenhum token nela', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))
    const payload = await response.text()
    const body = JSON.parse(payload) as { data: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(Object.keys(body.data).sort()).toEqual([
      'createdAt',
      'displayPhoneNumber',
      'id',
      'phoneNumberId',
      'status',
      'tokenConfigured',
      'updatedAt',
      'version',
      'wabaId',
    ])
    expect(payload).not.toContain('accessToken')
    expect(payload).not.toContain('secretEnvelope')
  })

  /** Empresa sem canal é `null` e `200` — ausência é o caso normal, e a tela abre vazia. */
  test('empresa sem canal responde nulo, não 404', async () => {
    const fixture = createFixture({ channel: null })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })
  })

  /** O token entra pelo corpo, e a resposta do salvar também não o devolve. */
  test('salva com token e não o devolve', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          accessToken: ACCESS_TOKEN,
          displayPhoneNumber: '5516999998888',
          phoneNumberId: '123456789012345',
          wabaId: '987654321098765',
        },
        method: 'PUT',
        path: PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain(ACCESS_TOKEN)
    expect(
      (fixture.calls.save?.[0] as { values: { accessToken?: string } }).values.accessToken,
    ).toBe(ACCESS_TOKEN)
  })

  /**
   * Atualizar **sem** token mantém o que está selado: ninguém relê o token para redigitá-lo, e exigi-lo
   * a cada correção de número mandaria o operador buscá-lo na Meta de novo.
   */
  test('atualiza sem token, e o campo simplesmente não viaja', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { phoneNumberId: '123456789012345', status: 'disabled', wabaId: '987654321098765' },
        method: 'PUT',
        path: PATH,
      }),
    )

    expect(response.status).toBe(200)
    const values = (fixture.calls.save?.[0] as { values: Record<string, unknown> }).values
    expect(values.accessToken).toBeUndefined()
    expect(values.status).toBe('disabled')
  })

  /** Id trocado por número só apareceria no primeiro envio, com o cliente do outro lado esperando. */
  test('recusa identificador fora do formato da Meta e campo desconhecido', async () => {
    const fixture = createFixture()

    const wrongId = await fixture.handle(
      jsonRequest({
        body: { phoneNumberId: '+55 16 99999-8888', wabaId: '987654321098765' },
        method: 'PUT',
        path: PATH,
      }),
    )
    expect(wrongId.status).toBe(400)

    const unknownField = await fixture.handle(
      jsonRequest({
        body: {
          companyId: 'x',
          phoneNumberId: '123456789012345',
          wabaId: '987654321098765',
        },
        method: 'PUT',
        path: PATH,
      }),
    )
    expect(unknownField.status).toBe(400)
    expect(fixture.calls.save).toEqual([])
  })

  test('remove devolve 204', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(jsonRequest({ method: 'DELETE', path: PATH }))

    expect(response.status).toBe(204)
    expect(fixture.calls.remove).toHaveLength(1)
  })

  /** Configurar o canal decide por qual número a empresa fala: é `settings.manage`, como a Nota RP. */
  test('exige settings.manage nas três', async () => {
    const fixture = createFixture({ permissions: new Set(['invoices.read'] as const) })

    for (const request of [
      jsonRequest({ method: 'GET', path: PATH }),
      jsonRequest({
        body: { phoneNumberId: '123456789012345', wabaId: '987654321098765' },
        method: 'PUT',
        path: PATH,
      }),
      jsonRequest({ method: 'DELETE', path: PATH }),
    ]) {
      expect((await fixture.handle(request)).status).toBe(403)
    }
  })
})
