/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 T1.4 (D2/D6): os esquemas `.strict()` do motorista aceitam `tappedAt` e `clockOffsetMs`
 * antes de o app os mandar — e o cliente antigo, sem os campos, segue passando. O servidor sobe
 * primeiro: app novo contra servidor velho recebe `400` em todo relato. Aqui os campos são
 * aceitos, validados e carregados como dado até a entrada do caso de uso; gravar é da T1.5.
 */
import { describe, expect, it } from 'bun:test'

import { MILLISECONDS_PER_DAY } from '../../src/shared/time.constant.js'
import { resolveOccurredAt } from '../../src/trips/domain/occurred-at.policy.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'
import {
  parseDepartureRequest,
  parseDocumentDeliveryRequest,
  parseDocumentReturnRequest,
  parseFieldReportRequest,
  parseStopOccurrenceRequest,
} from '../../src/trips/presentation/me-trip.schema.js'
import { authenticatedContext } from '../fixtures/freight-region-http.fixture.js'

const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TAPPED_AT = '2026-09-26T12:00:00.000Z'
const CLOCK_OFFSET_MS = -3_600_000
/** Um ano de desvio: o esquema não tem teto nele; quem descarta o absurdo é `resolveOccurredAt`. */
const ONE_YEAR_OFFSET_MS = 365 * MILLISECONDS_PER_DAY
/** Aparelho zerado em 1970: `tappedAt` de 1970 + este desvio dá a hora certa de 2026-09-26. */
const EPOCH_DEVICE_TAPPED_AT = '1970-01-01T03:00:00.000Z'
const EPOCH_DEVICE_OFFSET_MS =
  Date.parse('2026-09-26T15:00:00.000Z') - Date.parse(EPOCH_DEVICE_TAPPED_AT)
const RECEIVED_AT = new Date('2026-09-26T15:00:05.000Z')
const NEW_CLIENT_CLOCK = { clockOffsetMs: CLOCK_OFFSET_MS, tappedAt: TAPPED_AT }

type EventParser = {
  readonly baseBody: Record<string, unknown>
  readonly name: string
  readonly parse: (request: Request) => Promise<object>
}

/** Os quatro eventos do corpo JSON (a ocorrência tem as duas formas da spec 218 D2). */
const EVENT_PARSERS: readonly EventParser[] = [
  { baseBody: {}, name: 'arrive', parse: parseFieldReportRequest },
  { baseBody: {}, name: 'deliver', parse: parseDocumentDeliveryRequest },
  {
    baseBody: { reason: 'recipient_absent' },
    name: 'return',
    parse: parseDocumentReturnRequest,
  },
  { baseBody: { kind: 'other' }, name: 'occurrence (kind)', parse: parseStopOccurrenceRequest },
  {
    baseBody: { occurrenceTypeId: OCCURRENCE_TYPE_ID },
    name: 'occurrence (occurrenceTypeId)',
    parse: parseStopOccurrenceRequest,
  },
]

function jsonRequest(body: unknown): Request {
  return rawJsonRequest(JSON.stringify(body))
}

function rawJsonRequest(rawBody: string): Request {
  return new Request('http://localhost/me/trips/current/x', {
    body: rawBody,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'chave-1' },
    method: 'POST',
  })
}

async function expectBadRequest(operation: Promise<unknown>): Promise<void> {
  const error = await operation.catch((cause: unknown) => cause)
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).status).toBe(400)
}

for (const { baseBody, name, parse } of EVENT_PARSERS) {
  describe(`${name}: tappedAt e clockOffsetMs no corpo (spec 232 T1.4)`, () => {
    it('cliente antigo: sem os campos continua válido e o resultado não ganha as chaves', async () => {
      const parsed = await parse(jsonRequest(baseBody))

      expect('tappedAt' in parsed).toBe(false)
      expect('clockOffsetMs' in parsed).toBe(false)
    })

    it('cliente novo: os dois campos chegam ao resultado como Date e número', async () => {
      const parsed = (await parse(jsonRequest({ ...baseBody, ...NEW_CLIENT_CLOCK }))) as {
        readonly clockOffsetMs?: unknown
        readonly tappedAt?: unknown
      }

      expect(parsed.tappedAt).toBeInstanceOf(Date)
      expect((parsed.tappedAt as Date).toISOString()).toBe(TAPPED_AT)
      expect(parsed.clockOffsetMs).toBe(CLOCK_OFFSET_MS)
    })

    it('clockOffsetMs sem tappedAt é aceito, e o resultado não ganha tappedAt', async () => {
      const parsed = await parse(jsonRequest({ ...baseBody, clockOffsetMs: CLOCK_OFFSET_MS }))

      expect((parsed as { readonly clockOffsetMs?: unknown }).clockOffsetMs).toBe(CLOCK_OFFSET_MS)
      expect('tappedAt' in parsed).toBe(false)
    })

    it('tappedAt sem clockOffsetMs é aceito, e o resultado não ganha clockOffsetMs', async () => {
      const parsed = await parse(jsonRequest({ ...baseBody, tappedAt: TAPPED_AT }))

      expect((parsed as { readonly tappedAt?: unknown }).tappedAt).toBeInstanceOf(Date)
      expect('clockOffsetMs' in parsed).toBe(false)
    })

    it('desvio zero, um ano e o inteiro seguro nos dois sinais são aceitos: o esquema não tem teto', async () => {
      const accepted = [
        0,
        ONE_YEAR_OFFSET_MS,
        -ONE_YEAR_OFFSET_MS,
        ONE_YEAR_OFFSET_MS + 1,
        -ONE_YEAR_OFFSET_MS - 1,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
      ]

      for (const clockOffsetMs of accepted) {
        const parsed = await parse(jsonRequest({ ...baseBody, clockOffsetMs, tappedAt: TAPPED_AT }))

        expect((parsed as { readonly clockOffsetMs?: unknown }).clockOffsetMs).toBe(clockOffsetMs)
      }
    })

    it('aparelho com o relógio em 1970 é aceito e a hora corrigida sai certa', async () => {
      const parsed = (await parse(
        jsonRequest({
          ...baseBody,
          clockOffsetMs: EPOCH_DEVICE_OFFSET_MS,
          tappedAt: EPOCH_DEVICE_TAPPED_AT,
        }),
      )) as { readonly clockOffsetMs?: number; readonly tappedAt?: Date }

      expect(parsed.clockOffsetMs).toBe(EPOCH_DEVICE_OFFSET_MS)
      expect(
        resolveOccurredAt({
          clockOffsetMs: parsed.clockOffsetMs,
          receivedAt: RECEIVED_AT,
          tappedAt: parsed.tappedAt,
        }),
      ).toEqual({ kind: 'corrected', occurredAt: new Date('2026-09-26T15:00:00.000Z') })
    })

    /** R3: o Postgres recusa o ano 0 (22008); o relógio nunca derruba o evento, então o `tappedAt` cai. */
    it('tappedAt em ano impossível é descartado, nunca 400, e o resto do relato passa', async () => {
      for (const tappedAt of ['0000-01-01T00:00:00.000Z', '1899-12-31T23:59:59.000Z']) {
        const parsed = await parse(
          jsonRequest({ ...baseBody, clockOffsetMs: CLOCK_OFFSET_MS, tappedAt }),
        )

        expect('tappedAt' in parsed).toBe(false)
        expect((parsed as { readonly clockOffsetMs?: unknown }).clockOffsetMs).toBe(CLOCK_OFFSET_MS)
      }
    })

    it('tappedAt em 1900 e em 1970 continuam aceitos: aparelho zerado é o caso que a correção atende', async () => {
      for (const tappedAt of ['1900-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z']) {
        const parsed = (await parse(jsonRequest({ ...baseBody, tappedAt }))) as {
          readonly tappedAt?: Date
        }

        expect(parsed.tappedAt?.toISOString()).toBe(tappedAt)
      }
    })

    it('desvio absurdo é aceito, nunca 400, e resolveOccurredAt o descarta como futuro', async () => {
      const parsed = (await parse(
        jsonRequest({
          ...baseBody,
          clockOffsetMs: Number.MAX_SAFE_INTEGER,
          tappedAt: TAPPED_AT,
        }),
      )) as { readonly clockOffsetMs?: number; readonly tappedAt?: Date }

      expect(parsed.clockOffsetMs).toBe(Number.MAX_SAFE_INTEGER)
      expect(
        resolveOccurredAt({
          clockOffsetMs: parsed.clockOffsetMs,
          receivedAt: RECEIVED_AT,
          tappedAt: parsed.tappedAt,
        }),
      ).toEqual({ kind: 'ignored', reason: 'future' })
    })

    it('clockOffsetMs fracionário, texto, nulo, expoente ou além do inteiro seguro é 400', async () => {
      const invalidOffsets: readonly unknown[] = [1.5, '60000', null, 1e99, -1e99]

      for (const clockOffsetMs of invalidOffsets) {
        await expectBadRequest(
          parse(jsonRequest({ ...baseBody, clockOffsetMs, tappedAt: TAPPED_AT })),
        )
      }
    })

    it('clockOffsetMs NaN no corpo cru (JSON inválido) é 400', async () => {
      const rawBody = JSON.stringify({ ...baseBody, clockOffsetMs: 'PLACEHOLDER' }).replace(
        '"PLACEHOLDER"',
        'NaN',
      )

      await expectBadRequest(parse(rawJsonRequest(rawBody)))
    })

    it('tappedAt que não é ISO 8601 completo é 400', async () => {
      const invalidInstants: readonly unknown[] = [
        'ontem',
        '2026-09-26',
        '2026-09-26T12:00:00',
        1_790_000_000_000,
        null,
      ]

      for (const tappedAt of invalidInstants) {
        await expectBadRequest(
          parse(jsonRequest({ ...baseBody, clockOffsetMs: CLOCK_OFFSET_MS, tappedAt })),
        )
      }
    })

    it('campo desconhecido continua sendo 400: o .strict() segue vivo', async () => {
      await expectBadRequest(parse(jsonRequest({ ...baseBody, foo: 'bar' })))
      await expectBadRequest(parse(jsonRequest({ ...baseBody, ...NEW_CLIENT_CLOCK, foo: 'bar' })))
    })
  })
}

describe('depart e cancel-departure não mudam (spec 232 T1.4, d)', () => {
  it('tappedAt segue obrigatório, e o resultado carrega só location e tappedAt', async () => {
    const parsed = await parseDepartureRequest(jsonRequest({ tappedAt: TAPPED_AT }))

    expect(Object.keys(parsed).sort()).toEqual(['location', 'tappedAt'])
    await expectBadRequest(parseDepartureRequest(jsonRequest({})))
  })

  it('clockOffsetMs não entra: fora do escopo, continua sendo chave extra', async () => {
    await expectBadRequest(
      parseDepartureRequest(jsonRequest({ clockOffsetMs: CLOCK_OFFSET_MS, tappedAt: TAPPED_AT })),
    )
  })
})

describe('o multipart do comprovante aceita clockOffsetMs (spec 232 T1.4, e)', () => {
  function proofRequest(fields: Record<string, string>): Request {
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' }))
    form.set('kind', 'photo')
    for (const [name, value] of Object.entries(fields)) form.set(name, value)

    return new Request('http://api.test/me/trips/current/documents/x/proof', {
      body: form,
      method: 'POST',
    })
  }

  it('texto inteiro vira número no upload, negativo inclusive', async () => {
    const upload = await parseDeliveryProofUpload(proofRequest({ clockOffsetMs: '-3600000' }))

    expect(upload.clockOffsetMs).toBe(CLOCK_OFFSET_MS)
  })

  it('zero, um ano, o inteiro seguro e o relógio de 1970 são aceitos: o esquema não tem teto', async () => {
    const accepted = [
      0,
      ONE_YEAR_OFFSET_MS,
      -ONE_YEAR_OFFSET_MS,
      ONE_YEAR_OFFSET_MS + 1,
      -ONE_YEAR_OFFSET_MS - 1,
      EPOCH_DEVICE_OFFSET_MS,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ]

    for (const clockOffsetMs of accepted) {
      const upload = await parseDeliveryProofUpload(
        proofRequest({ clockOffsetMs: String(clockOffsetMs) }),
      )

      expect(upload.clockOffsetMs).toBe(clockOffsetMs)
    }
  })

  it('relógio em 1970: aceito e resolveOccurredAt devolve a hora certa; absurdo é descartado, não recusado', async () => {
    const epoch = await parseDeliveryProofUpload(
      proofRequest({ clockOffsetMs: String(EPOCH_DEVICE_OFFSET_MS) }),
    )
    const absurd = await parseDeliveryProofUpload(
      proofRequest({ clockOffsetMs: String(Number.MAX_SAFE_INTEGER) }),
    )

    expect(
      resolveOccurredAt({
        clockOffsetMs: epoch.clockOffsetMs,
        receivedAt: RECEIVED_AT,
        tappedAt: new Date(EPOCH_DEVICE_TAPPED_AT),
      }),
    ).toEqual({ kind: 'corrected', occurredAt: new Date('2026-09-26T15:00:00.000Z') })
    expect(
      resolveOccurredAt({
        clockOffsetMs: absurd.clockOffsetMs,
        receivedAt: RECEIVED_AT,
        tappedAt: new Date(TAPPED_AT),
      }),
    ).toEqual({ kind: 'ignored', reason: 'future' })
  })

  it('ausente ou vazio: o upload não ganha a chave (cliente antigo)', async () => {
    for (const fields of [{}, { clockOffsetMs: '' }]) {
      const upload = await parseDeliveryProofUpload(proofRequest(fields))

      expect('clockOffsetMs' in upload).toBe(false)
    }
  })

  it('texto que não é inteiro, ou além do inteiro seguro, é 400', async () => {
    const invalidTexts = [
      'abc',
      '1.5',
      '1e99',
      '1e3',
      '+5',
      ' 5',
      'NaN',
      'Infinity',
      '9'.repeat(16),
      '-' + '9'.repeat(16),
      '9'.repeat(40),
    ]

    for (const clockOffsetMs of invalidTexts) {
      await expectBadRequest(parseDeliveryProofUpload(proofRequest({ clockOffsetMs })))
    }
  })
})

describe('pela rota: os campos chegam à dependência como dado (spec 232 T1.4)', () => {
  const CONTEXT = authenticatedContext(new Set(['trip.report'] as const))

  function buildRoutes() {
    const calls: Record<string, Record<string, unknown>> = {}
    const record = <TResult>(name: string, result: TResult) => {
      return async (input: object): Promise<TResult> => {
        calls[name] = { ...input }
        return result
      }
    }
    const NOT_CALLED = () => {
      throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
    }
    const routes = createMeTripRoutes({
      attachProof: record('attachProof', { id: 'proof-1', punctuality: 'on_time' }),
      cancelStopDeparture: NOT_CALLED,
      confirmOccurrenceUpload: NOT_CALLED,
      createOccurrenceUpload: NOT_CALLED,
      dispatchCurrentTrip: NOT_CALLED,
      findCurrentTrip: NOT_CALLED,
      listFieldOccurrenceTypes: NOT_CALLED,
      readDeliveryProofs: NOT_CALLED,
      readManifestXml: NOT_CALLED,
      registerDriverOccurrence: NOT_CALLED,
      renderManifestDamdfe: NOT_CALLED,
      reportArrival: record('reportArrival', { id: 'event-1' }),
      reportDeparture: NOT_CALLED,
      reportDelivery: record('reportDelivery', { id: 'event-1' } as never),
      reportOccurrence: record('reportOccurrence', { id: 'event-1' }),
      reportReturn: record('reportReturn', { id: 'event-1' } as never),
      resolveDriverId: async () => DRIVER_ID,
      startFieldTrip: NOT_CALLED,
    })

    return { calls, routes }
  }

  async function execute(input: {
    readonly body: FormData | string
    readonly contentType?: string
    readonly pathParameters: Record<string, string>
    readonly routes: ReturnType<typeof buildRoutes>['routes']
    readonly suffix: string
  }): Promise<Response> {
    const route = input.routes.find(
      (candidate) => candidate.method === 'POST' && candidate.pathname.endsWith(input.suffix),
    )
    if (route === undefined) throw new Error(`route not found: ${input.suffix}`)

    return route.execute({
      context: CONTEXT,
      correlationId: 'c-1',
      pathParameters: input.pathParameters,
      request: new Request(`http://localhost${route.pathname}`, {
        body: input.body,
        headers: {
          'idempotency-key': 'chave-1',
          ...(input.contentType === undefined ? {} : { 'content-type': input.contentType }),
        },
        method: 'POST',
      }),
    })
  }

  const JSON_ROUTES = [
    {
      body: {},
      callName: 'reportArrival',
      pathParameters: { stopId: STOP_ID },
      suffix: '/arrive',
    },
    {
      body: {},
      callName: 'reportDelivery',
      pathParameters: { documentId: DOCUMENT_ID },
      suffix: '/deliver',
    },
    {
      body: { reason: 'recipient_absent' },
      callName: 'reportReturn',
      pathParameters: { documentId: DOCUMENT_ID },
      suffix: '/return',
    },
    {
      body: { kind: 'other' },
      callName: 'reportOccurrence',
      pathParameters: { stopId: STOP_ID },
      suffix: '/stops/:stopId/occurrences',
    },
  ] as const

  for (const { body, callName, pathParameters, suffix } of JSON_ROUTES) {
    it(`${suffix}: tappedAt e clockOffsetMs chegam a ${callName}; cliente antigo não os leva`, async () => {
      const newClient = buildRoutes()
      const newResponse = await execute({
        body: JSON.stringify({ ...body, ...NEW_CLIENT_CLOCK }),
        contentType: 'application/json',
        pathParameters,
        routes: newClient.routes,
        suffix,
      })

      expect(newResponse.status).toBe(201)
      const received = newClient.calls[callName]
      expect(received?.clockOffsetMs).toBe(CLOCK_OFFSET_MS)
      expect((received?.tappedAt as Date).toISOString()).toBe(TAPPED_AT)

      const oldClient = buildRoutes()
      const oldResponse = await execute({
        body: JSON.stringify(body),
        contentType: 'application/json',
        pathParameters,
        routes: oldClient.routes,
        suffix,
      })

      expect(oldResponse.status).toBe(201)
      expect('clockOffsetMs' in (oldClient.calls[callName] ?? {})).toBe(false)
      expect('tappedAt' in (oldClient.calls[callName] ?? {})).toBe(false)
    })
  }

  it('/proof: o clockOffsetMs do multipart chega ao attachProof dentro do upload', async () => {
    const { calls, routes } = buildRoutes()
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' }))
    form.set('kind', 'photo')
    form.set('capturedAt', TAPPED_AT)
    form.set('clockOffsetMs', String(CLOCK_OFFSET_MS))

    const response = await execute({
      body: form,
      pathParameters: { documentId: DOCUMENT_ID },
      routes,
      suffix: '/proof',
    })

    expect(response.status).toBe(201)
    const upload = calls.attachProof?.upload as { readonly clockOffsetMs?: number }
    expect(upload.clockOffsetMs).toBe(CLOCK_OFFSET_MS)
  })

  it('/proof: sem o campo (cliente antigo) o upload não ganha a chave', async () => {
    const { calls, routes } = buildRoutes()
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' }))
    form.set('kind', 'photo')

    const response = await execute({
      body: form,
      pathParameters: { documentId: DOCUMENT_ID },
      routes,
      suffix: '/proof',
    })

    expect(response.status).toBe(201)
    expect('clockOffsetMs' in (calls.attachProof?.upload as object)).toBe(false)
  })
})
