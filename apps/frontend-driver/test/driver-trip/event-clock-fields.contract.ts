/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  CLOCK_FIELD_REPORT_KINDS,
  createClockOffsetStore,
  type EventClockStamp,
} from '../../src/modules/driver-trip/shared/clockOffset.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  createDriverTripClient,
  reportBody,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  drainQueueWithAttachments,
  type AttachmentStore,
} from '../../src/modules/driver-trip/shared/offlineAttachments.service'
import {
  drainQueue,
  enqueueReport,
  enqueueReports,
  type OfflineQueueStore,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'

const CREATED_AT = '2026-10-03T10:00:00.000Z'
const CREATED_AT_DATE = new Date(CREATED_AT)
/** O aparelho estava 90 s atrasado quando o motorista tocou. */
const OFFSET_AT_TAP_MS = 90_000
/** Medido depois, na drenagem: outro valor, para provar de qual dos dois o corpo sai. */
const OFFSET_AT_DRAIN_MS = -4_200
const STAMP: EventClockStamp = { clockOffsetMs: OFFSET_AT_TAP_MS, tappedAt: CREATED_AT }
const API = 'https://api.test'
const UPLOAD_URL = 'https://storage.test/bucket/objeto?X-Amz-Signature=assinatura'
const PHOTO = {
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  fileName: 'f.jpg',
}
/** O `tappedAt` próprio de depart/cancelDeparture (spec 206) — nunca o carimbo da fila. */
const OWN_TAPPED_AT = '2026-10-03T09:30:00.000Z'

/**
 * Um relato de cada `kind`. O `satisfies` obriga o arquivo a conhecer todo `kind` novo: quem criar
 * um é forçado a decidir aqui se ele leva os campos de relógio.
 */
const REPORT_BY_KIND = {
  arrive: { idempotencyKey: 'k-arrive', kind: 'arrive', location: null, stopId: 'stop-1' },
  cancelDeparture: {
    idempotencyKey: 'k-cancel',
    kind: 'cancelDeparture',
    location: null,
    stopId: 'stop-1',
    tappedAt: OWN_TAPPED_AT,
  },
  depart: {
    idempotencyKey: 'k-depart',
    kind: 'depart',
    location: null,
    stopId: 'stop-1',
    tappedAt: OWN_TAPPED_AT,
  },
  deliver: { documentId: 'doc-1', idempotencyKey: 'k-deliver', kind: 'deliver', location: null },
  dispatch: { idempotencyKey: 'k-dispatch', kind: 'dispatch', tripId: 'trip-1' },
  documentOccurrence: {
    documentId: 'doc-1',
    idempotencyKey: 'k-doc-occ',
    kind: 'documentOccurrence',
    note: 'avaria',
    occurrenceTypeId: 'type-1',
    occurrenceTypeName: 'Avaria',
    photo: PHOTO,
    productCode: '',
  },
  occurrence: {
    description: 'doca fechada',
    documentId: null,
    idempotencyKey: 'k-occ',
    kind: 'occurrence',
    occurrenceTypeId: 'type-2',
    stopId: 'stop-1',
  },
  proofReceiver: {
    documentId: 'doc-1',
    fields: { receiverName: 'Maria' },
    idempotencyKey: 'k-receiver',
    kind: 'proofReceiver',
  },
  return: {
    documentId: 'doc-1',
    idempotencyKey: 'k-return',
    kind: 'return',
    location: null,
    reason: 'recipient_absent',
  },
  stopOccurrencePhoto: {
    description: 'doca fechada',
    documentId: null,
    idempotencyKey: 'k-stop-photo',
    kind: 'stopOccurrencePhoto',
    occurrenceKey: 'k-occ',
    occurrenceTypeId: 'type-2',
    photo: PHOTO,
    stopId: 'stop-1',
  },
} as const satisfies Record<DriverFieldReport['kind'], DriverFieldReport>

type SeenRequest = Readonly<{
  body: Record<string, unknown> | undefined
  method: string
  path: string
}>

/** Responde o que cada passo do `send` espera — upload assinado, `PUT`, confirmação, relato. */
function buildRecordingClient(seen: SeenRequest[]) {
  return createDriverTripClient({
    apiUrl: API,
    fetch: async (input) => {
      const request = input as Request
      const url = new URL(request.url)
      const text =
        request.method === 'PUT' || url.origin !== API ? '' : await request.clone().text()
      seen.push({
        body: text.startsWith('{') ? (JSON.parse(text) as Record<string, unknown>) : undefined,
        method: request.method,
        path: url.pathname,
      })
      if (url.origin !== API) return new Response(null, { status: 200 })
      const data = url.pathname.endsWith('/occurrence-uploads')
        ? { id: 'upload-1', uploadUrl: UPLOAD_URL }
        : { id: 'object-1' }
      return new Response(JSON.stringify({ data }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    },
    getAccessToken: () => Promise.resolve('token'),
  })
}

const ACCEPTING_ROUTE_SUFFIX_BY_KIND: Readonly<Record<string, string>> = {
  arrive: '/arrive',
  deliver: '/deliver',
  occurrence: '/occurrences',
  return: '/return',
  stopOccurrencePhoto: '/occurrences',
}

async function sendAndCollect(
  report: DriverFieldReport,
  stamp: EventClockStamp | undefined,
): Promise<readonly SeenRequest[]> {
  const seen: SeenRequest[] = []
  await buildRecordingClient(seen).send(report, stamp)
  return seen
}

describe('quais relatos levam tappedAt e clockOffsetMs (spec 234, esquemas .strict() da API)', () => {
  it('são exatamente arrive, deliver, return e a ocorrência de parada (com a foto dela)', () => {
    expect([...CLOCK_FIELD_REPORT_KINDS].sort()).toEqual([
      'arrive',
      'deliver',
      'occurrence',
      'return',
      'stopOccurrencePhoto',
    ])
  })

  for (const kind of CLOCK_FIELD_REPORT_KINDS) {
    it(`${kind}: a requisição do relato leva os dois campos do carimbo`, async () => {
      const seen = await sendAndCollect(REPORT_BY_KIND[kind], STAMP)

      const reportRequest = seen.find((request) =>
        request.path.endsWith(ACCEPTING_ROUTE_SUFFIX_BY_KIND[kind] ?? '#'),
      )
      expect(reportRequest?.body?.clockOffsetMs).toBe(OFFSET_AT_TAP_MS)
      expect(reportRequest?.body?.tappedAt).toBe(CREATED_AT)
    })
  }

  const kindsOutsideTheSet = (Object.keys(REPORT_BY_KIND) as DriverFieldReport['kind'][]).filter(
    (kind) => !(CLOCK_FIELD_REPORT_KINDS as readonly string[]).includes(kind),
  )

  it('os kinds de fora do conjunto existem (o teste de baixo não é vazio)', () => {
    expect(kindsOutsideTheSet.sort()).toEqual([
      'cancelDeparture',
      'depart',
      'dispatch',
      'documentOccurrence',
      'proofReceiver',
    ])
  })

  for (const kind of kindsOutsideTheSet) {
    it(`${kind}: nenhuma requisição leva clockOffsetMs nem o tappedAt do carimbo`, async () => {
      const seen = await sendAndCollect(REPORT_BY_KIND[kind], STAMP)

      expect(seen.length).toBeGreaterThan(0)
      for (const request of seen) {
        expect(request.body?.clockOffsetMs).toBe(undefined)
        expect(request.body?.tappedAt).not.toBe(CREATED_AT)
      }
    })
  }

  it('depart e cancelDeparture seguem com o tappedAt próprio, da spec 206', async () => {
    for (const kind of ['cancelDeparture', 'depart'] as const) {
      const [request] = await sendAndCollect(REPORT_BY_KIND[kind], STAMP)
      expect(request?.body?.tappedAt).toBe(OWN_TAPPED_AT)
    }
  })

  it('o upload e a confirmação da foto de ocorrência nunca levam os campos (esquemas estritos)', async () => {
    const seen = await sendAndCollect(REPORT_BY_KIND.stopOccurrencePhoto, STAMP)

    const nonReport = seen.filter((request) => !request.path.endsWith('/occurrences'))
    expect(nonReport.length).toBeGreaterThanOrEqual(3)
    for (const request of nonReport) {
      expect(request.body?.clockOffsetMs).toBe(undefined)
      expect(request.body?.tappedAt).toBe(undefined)
    }
  })

  it('sem desvio medido o corpo sai como sempre saiu, sem nenhum dos dois campos', async () => {
    for (const kind of CLOCK_FIELD_REPORT_KINDS) {
      const seen = await sendAndCollect(REPORT_BY_KIND[kind], undefined)
      for (const request of seen) {
        expect(request.body !== undefined && 'clockOffsetMs' in request.body).toBe(false)
        expect(request.body !== undefined && 'tappedAt' in request.body).toBe(false)
      }
    }
  })
})

describe('reportBody com o carimbo (spec 234 D2)', () => {
  it('deliver leva tappedAt e clockOffsetMs ao lado da posição', () => {
    const body = reportBody(REPORT_BY_KIND.deliver, STAMP)

    expect(JSON.parse(body)).toEqual({
      clockOffsetMs: OFFSET_AT_TAP_MS,
      location: null,
      tappedAt: CREATED_AT,
    })
  })

  it('desvio zero é desvio medido: o campo vai com 0, não some', () => {
    const body = reportBody(REPORT_BY_KIND.arrive, { clockOffsetMs: 0, tappedAt: CREATED_AT })

    expect(JSON.parse(body)).toEqual({ clockOffsetMs: 0, location: null, tappedAt: CREATED_AT })
  })

  it('sem carimbo o corpo é o de hoje', () => {
    expect(JSON.parse(reportBody(REPORT_BY_KIND.deliver))).toEqual({ location: null })
    expect(JSON.parse(reportBody(REPORT_BY_KIND.return))).toEqual({
      location: null,
      reason: 'recipient_absent',
    })
  })
})

describe('o multipart do comprovante leva o desvio (spec 234 D2)', () => {
  async function attachAndReadForm(clockOffsetMs: number | undefined): Promise<FormData> {
    let captured: Request | undefined
    const client = createDriverTripClient({
      apiUrl: API,
      fetch: (input) => {
        captured = input as Request
        return Promise.resolve(
          new Response('{"data":{"id":"proof-1","punctuality":"on_time"}}', {
            headers: { 'content-type': 'application/json' },
          }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    await client.attachProof({
      capturedAt: CREATED_AT,
      ...(clockOffsetMs === undefined ? {} : { clockOffsetMs }),
      documentId: 'doc-1',
      file: new File([new Uint8Array([1])], 'canhoto.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })
    if (captured === undefined) throw new Error('nenhum pedido saiu')
    return captured.formData()
  }

  it('manda clockOffsetMs como texto inteiro, ao lado do capturedAt', async () => {
    const form = await attachAndReadForm(OFFSET_AT_TAP_MS)

    expect(form.get('clockOffsetMs')).toBe('90000')
    expect(form.get('capturedAt')).toBe(CREATED_AT)
  })

  it('mantém o sinal e o zero', async () => {
    expect((await attachAndReadForm(-4_200)).get('clockOffsetMs')).toBe('-4200')
    expect((await attachAndReadForm(0)).get('clockOffsetMs')).toBe('0')
  })

  it('sem desvio medido o campo não vai', async () => {
    const form = await attachAndReadForm(undefined)

    expect(form.has('clockOffsetMs')).toBe(false)
  })
})

function createMemoryStore(initial: readonly QueuedReport[] = []) {
  let items = [...initial]
  const store: OfflineQueueStore = {
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = [...mutate(items)]
      return Promise.resolve(items)
    },
  }
  return { items: () => items, store }
}

function createEmptyAttachmentStore(): AttachmentStore {
  return {
    read: () => Promise.resolve([]),
    readAll: () => Promise.resolve([]),
    readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
    remove: () => Promise.resolve(),
    update: () => Promise.resolve([]),
  }
}

describe('a fila carimba o desvio na criação do item (spec 234 D2)', () => {
  it('enqueueReport guarda o desvio recebido, ao lado do createdAt', async () => {
    const { items, store } = createMemoryStore()

    await enqueueReport({
      clockOffsetMs: OFFSET_AT_TAP_MS,
      now: CREATED_AT_DATE,
      report: REPORT_BY_KIND.deliver,
      store,
    })

    expect(items()[0]?.createdAt).toBe(CREATED_AT)
    expect(items()[0]?.clockOffsetMs).toBe(OFFSET_AT_TAP_MS)
  })

  it('enqueueReports carimba cada item do mesmo toque com o mesmo desvio', async () => {
    const { items, store } = createMemoryStore()

    await enqueueReports({
      clockOffsetMs: OFFSET_AT_TAP_MS,
      now: CREATED_AT_DATE,
      reports: [REPORT_BY_KIND.occurrence, REPORT_BY_KIND.return],
      store,
    })

    expect(items().map((item) => item.clockOffsetMs)).toEqual([OFFSET_AT_TAP_MS, OFFSET_AT_TAP_MS])
  })

  it('desvio zero fica gravado', async () => {
    const { items, store } = createMemoryStore()

    await enqueueReport({
      clockOffsetMs: 0,
      now: CREATED_AT_DATE,
      report: REPORT_BY_KIND.arrive,
      store,
    })

    expect(items()[0]?.clockOffsetMs).toBe(0)
  })

  it('sem desvio medido o item nasce sem o campo (cliente sem referência de hora)', async () => {
    const { items, store } = createMemoryStore()

    await enqueueReport({ now: CREATED_AT_DATE, report: REPORT_BY_KIND.arrive, store })
    await enqueueReports({
      now: CREATED_AT_DATE,
      reports: [REPORT_BY_KIND.deliver],
      store,
    })

    expect(items().every((item) => !('clockOffsetMs' in item))).toBe(true)
  })

  /** O item não relê o armazenamento: o desvio de depois não reescreve o toque de antes. */
  it('o desvio do envio nunca troca o da criação — o corpo sai com o de quando o toque nasceu', async () => {
    const clockStore = createClockOffsetStore()
    clockStore.write(OFFSET_AT_TAP_MS)
    const { items, store } = createMemoryStore()
    await enqueueReport({
      clockOffsetMs: clockStore.read(),
      now: CREATED_AT_DATE,
      report: REPORT_BY_KIND.deliver,
      store,
    })

    clockStore.write(OFFSET_AT_DRAIN_MS)
    const seen: SeenRequest[] = []
    const client = buildRecordingClient(seen)
    await drainQueueWithAttachments({
      attachmentStore: createEmptyAttachmentStore(),
      send: async (report, stamp) => {
        await client.send(report, stamp)
        return { kind: 'sent' }
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(items()).toHaveLength(0)
    expect(seen[0]?.body?.clockOffsetMs).toBe(OFFSET_AT_TAP_MS)
    expect(seen[0]?.body?.tappedAt).toBe(CREATED_AT)
  })
})

describe('a drenagem entrega o carimbo do item ao envio (spec 234 D2)', () => {
  const stampedItem: QueuedReport = {
    attempts: 0,
    clockOffsetMs: OFFSET_AT_TAP_MS,
    createdAt: CREATED_AT,
    report: REPORT_BY_KIND.deliver,
  }
  const legacyItem: QueuedReport = {
    attempts: 0,
    createdAt: CREATED_AT,
    report: REPORT_BY_KIND.arrive,
  }

  it('drainQueueWithAttachments: tappedAt é o createdAt do item, desvio é o gravado nele', async () => {
    const stamps: (EventClockStamp | undefined)[] = []
    const { store } = createMemoryStore([stampedItem])

    await drainQueueWithAttachments({
      attachmentStore: createEmptyAttachmentStore(),
      send: (_report, stamp) => {
        stamps.push(stamp)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(stamps).toEqual([{ clockOffsetMs: OFFSET_AT_TAP_MS, tappedAt: CREATED_AT }])
  })

  it('item antigo, sem o campo, sai sem carimbo — como saía antes', async () => {
    const stamps: (EventClockStamp | undefined)[] = []
    const { store } = createMemoryStore([legacyItem])

    await drainQueueWithAttachments({
      attachmentStore: createEmptyAttachmentStore(),
      send: (_report, stamp) => {
        stamps.push(stamp)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(stamps).toEqual([undefined])
  })

  it('drainQueue (a fila simples) também entrega o carimbo', async () => {
    const stamps: (EventClockStamp | undefined)[] = []
    const { store } = createMemoryStore([stampedItem, legacyItem])

    await drainQueue({
      send: (_report, stamp) => {
        stamps.push(stamp)
        return Promise.resolve('sent')
      },
      store,
    })

    expect(stamps).toEqual([{ clockOffsetMs: OFFSET_AT_TAP_MS, tappedAt: CREATED_AT }, undefined])
  })

  it('o item recusado pelo servidor guarda o desvio da criação para o reenvio manual', async () => {
    const { items, store } = createMemoryStore([stampedItem])

    await drainQueueWithAttachments({
      attachmentStore: createEmptyAttachmentStore(),
      send: () => Promise.resolve({ cause: '422 X', kind: 'rejected' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(items()[0]?.rejectionCause).toBe('422 X')
    expect(items()[0]?.clockOffsetMs).toBe(OFFSET_AT_TAP_MS)
  })
})
