/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'

/**
 * Spec 254 T1.4 (RF1-RF5, CA1, CA2, CA5): o coletor de diagnóstico do aparelho. API futura — os três
 * módulos, a opção `diagnostics` do cliente e o segundo argumento de `client.send` ainda não existem,
 * por isso as importações são dinâmicas e as chamadas passam por tipos locais.
 */
const CLIENT_DIAGNOSTICS_MODULE = '../../src/modules/driver-trip/shared/clientDiagnostics.service'
const STEP_TIMER_MODULE = '../../src/modules/driver-trip/shared/stepTimer.service'
const DEVICE_PROFILE_MODULE = '../../src/modules/driver-trip/shared/deviceProfile.service'

const API = 'https://api.test'
const STORAGE_ORIGIN = 'https://storage.test'
const UPLOAD_ID = '00000000-0000-4000-8000-0000000000a1'
const UPLOAD_URL = `${STORAGE_ORIGIN}/bucket/objeto-secreto?X-Amz-Signature=assinatura-secreta`
const SLOT_PATH = '/me/trips/current/documents/document-1/occurrence-uploads'
const OBSERVATION_NOTE = 'Cliente recusou na porta'
const BUFFER_LIMIT = 50
const BATCH_LIMIT = 20

type DiagnosticEvent = Readonly<{
  eventKind: 'send_failed' | 'step_timing'
  step: string
  durationMs?: number
  failureKind?: 'network' | 'timeout' | 'http_status' | 'identity'
  httpStatus?: number
  attempt?: number
  reportKind?: string
  photoBytes?: number
  idempotencyKey?: string
  attachmentKey?: string
  occurredAt: string
}>

type DiagnosticInput = Omit<DiagnosticEvent, 'occurredAt'>

type DeviceProfile = Readonly<Record<string, unknown>>

type DiagnosticsBatch = Readonly<{ device?: DeviceProfile; events: readonly DiagnosticEvent[] }>

type DiagnosticsSendResult = Readonly<{ status: number }>

type ClientDiagnostics = Readonly<{
  record: (event: DiagnosticInput) => void
  flush: () => Promise<void>
}>

type ClientDiagnosticsModule = Readonly<{
  createClientDiagnostics: (input: {
    send: (batch: DiagnosticsBatch) => Promise<DiagnosticsSendResult>
    now?: () => Date
    device?: DeviceProfile
  }) => ClientDiagnostics
}>

type StepTimerModule = Readonly<{
  createStepTimer: (input: { clock: () => number; record: (event: DiagnosticInput) => void }) => {
    startStep: (step: string) => { end: (outcome: 'completed' | 'failed') => void }
  }
}>

type DeviceProfileModule = Readonly<{
  buildDeviceProfile: (input: {
    navigator: Readonly<{
      deviceMemory?: number
      hardwareConcurrency?: number
      connection?: Readonly<{ effectiveType?: string; saveData?: boolean }>
    }>
    isStandalone?: boolean
    appVersion?: string
  }) => DeviceProfile
}>

async function loadCollector(): Promise<ClientDiagnosticsModule> {
  return (await import(CLIENT_DIAGNOSTICS_MODULE)) as ClientDiagnosticsModule
}

function buildInput(index: number): DiagnosticInput {
  return { durationMs: index, eventKind: 'step_timing', step: 'upload_slot' }
}

function buildRecordingSender(status = 204) {
  const batches: DiagnosticsBatch[] = []
  return {
    batches,
    send: (batch: DiagnosticsBatch) => {
      batches.push(batch)
      return Promise.resolve({ status })
    },
  }
}

function durationsOf(batch: DiagnosticsBatch | undefined): number[] {
  return (batch?.events ?? []).map((event) => event.durationMs ?? -1)
}

describe('record é síncrono e nunca lança (spec 254 RF5)', () => {
  it('entrada malformada, relógio e envio que lançam: nada escapa', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const diagnostics = createClientDiagnostics({
      now: () => {
        throw new Error('relógio quebrado')
      },
      send: () => {
        throw new Error('envio quebrado')
      },
    })

    const malformed = [undefined, null, 42, 'texto', {}, { eventKind: 7 }, [] as unknown[]]
    for (const input of malformed) {
      expect(() => diagnostics.record(input as unknown as DiagnosticInput)).not.toThrow()
    }
    expect(() => diagnostics.record(buildInput(1))).not.toThrow()
    expect(diagnostics.record(buildInput(2))).toBeUndefined()
    await diagnostics.flush()
  })
})

describe('o buffer guarda 50 eventos e descarta o mais antigo (spec 254 C4)', () => {
  it('60 eventos gravados: saem os 50 mais novos, em lotes de 20, 20 e 10', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const { batches, send } = buildRecordingSender()
    const diagnostics = createClientDiagnostics({ send })

    for (let index = 0; index < 60; index += 1) diagnostics.record(buildInput(index))
    await diagnostics.flush()
    await diagnostics.flush()
    await diagnostics.flush()
    await diagnostics.flush()

    expect(batches.map((batch) => batch.events.length)).toEqual([20, 20, 10])
    expect(batches.flatMap(durationsOf)).toEqual(
      Array.from({ length: BUFFER_LIMIT }, (_, i) => i + 10),
    )
  })
})

describe('flush envia lotes de até 20 eventos por requisição (spec 254 C5)', () => {
  it('45 eventos: um pedido de 20 por flush, o resto fica para o próximo', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const { batches, send } = buildRecordingSender()
    const diagnostics = createClientDiagnostics({ send })

    for (let index = 0; index < 45; index += 1) diagnostics.record(buildInput(index))
    await diagnostics.flush()

    expect(batches).toHaveLength(1)
    expect(batches[0]?.events).toHaveLength(BATCH_LIMIT)

    await diagnostics.flush()
    await diagnostics.flush()

    expect(batches.map((batch) => batch.events.length)).toEqual([20, 20, 5])
  })

  it('sem evento no buffer, não há pedido', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const { batches, send } = buildRecordingSender()

    await createClientDiagnostics({ send }).flush()

    expect(batches).toHaveLength(0)
  })

  it('o device vai junto do lote e cada evento leva occurredAt em ISO', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const { batches, send } = buildRecordingSender()
    const diagnostics = createClientDiagnostics({
      device: { hardwareConcurrency: 4 },
      now: () => new Date('2026-10-07T12:00:00.000Z'),
      send,
    })

    diagnostics.record(buildInput(1))
    await diagnostics.flush()

    expect(batches[0]?.device).toEqual({ hardwareConcurrency: 4 })
    expect(batches[0]?.events[0]?.occurredAt).toBe('2026-10-07T12:00:00.000Z')
  })
})

describe('o que acontece com o lote conforme a resposta (spec 254 RF5)', () => {
  it('rede caída no envio: flush não propaga e os eventos esperam o próximo contato', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const delivered = buildRecordingSender()
    let isOnline = false
    const diagnostics = createClientDiagnostics({
      send: (batch) =>
        isOnline ? delivered.send(batch) : Promise.reject(new TypeError('Failed to fetch')),
    })

    for (let index = 0; index < 3; index += 1) diagnostics.record(buildInput(index))
    await diagnostics.flush()

    isOnline = true
    await diagnostics.flush()

    expect(delivered.batches.flatMap(durationsOf)).toEqual([0, 1, 2])
  })

  it('400 descarta o lote: o mesmo corpo nunca seria aceito', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const { batches, send } = buildRecordingSender(400)
    const diagnostics = createClientDiagnostics({ send })

    diagnostics.record(buildInput(1))
    await diagnostics.flush()
    await diagnostics.flush()

    expect(batches).toHaveLength(1)
  })

  it('429 devolve o lote ao buffer', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const { batches, send } = buildRecordingSender(429)
    const diagnostics = createClientDiagnostics({ send })

    diagnostics.record(buildInput(1))
    diagnostics.record(buildInput(2))
    await diagnostics.flush()
    await diagnostics.flush()

    expect(batches.map(durationsOf)).toEqual([
      [1, 2],
      [1, 2],
    ])
  })

  it('o que volta ao buffer respeita o teto de 50, descartando o mais antigo', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const delivered = buildRecordingSender()
    let releaseFirstSend: (result: DiagnosticsSendResult) => void = () => undefined
    let isFirstSend = true
    const diagnostics = createClientDiagnostics({
      send: (batch) => {
        if (!isFirstSend) return delivered.send(batch)
        isFirstSend = false
        return new Promise<DiagnosticsSendResult>((resolve) => {
          releaseFirstSend = resolve
        })
      },
    })

    for (let index = 0; index < 20; index += 1) diagnostics.record(buildInput(index))
    const firstFlush = diagnostics.flush()
    for (let index = 20; index < 60; index += 1) diagnostics.record(buildInput(index))
    releaseFirstSend({ status: 429 })
    await firstFlush

    await diagnostics.flush()
    await diagnostics.flush()
    await diagnostics.flush()

    expect(delivered.batches.flatMap(durationsOf)).toEqual(
      Array.from({ length: BUFFER_LIMIT }, (_, i) => i + 10),
    )
  })

  it('o coletor nunca registra evento sobre o próprio envio que falhou', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const delivered = buildRecordingSender()
    let isOnline = false
    const diagnostics = createClientDiagnostics({
      send: (batch) =>
        isOnline ? delivered.send(batch) : Promise.reject(new TypeError('Failed to fetch')),
    })

    diagnostics.record(buildInput(1))
    await diagnostics.flush()
    await diagnostics.flush()
    isOnline = true
    await diagnostics.flush()
    await diagnostics.flush()

    expect(delivered.batches.flatMap(durationsOf)).toEqual([1])
  })
})

describe('stepTimer mede com relógio injetado (spec 254 RF2)', () => {
  it('startStep/end emite step_timing com o passo e a duração em ms inteiros', async () => {
    const { createStepTimer } = (await import(STEP_TIMER_MODULE)) as StepTimerModule
    const recorded: DiagnosticInput[] = []
    const ticks = [100, 350.4]
    const timer = createStepTimer({
      clock: () => ticks.shift() ?? 0,
      record: (event) => recorded.push(event),
    })

    const step = timer.startStep('upload_slot')
    expect(recorded).toHaveLength(0)
    step.end('completed')

    expect(recorded).toEqual([{ durationMs: 250, eventKind: 'step_timing', step: 'upload_slot' }])
  })
})

describe('deviceProfile só diz o que o navegador expõe (spec 254 RF3)', () => {
  it('navegador completo: todos os campos, com os nomes do contrato', async () => {
    const { buildDeviceProfile } = (await import(DEVICE_PROFILE_MODULE)) as DeviceProfileModule

    const profile = buildDeviceProfile({
      appVersion: '1.2.3',
      isStandalone: true,
      navigator: {
        connection: { effectiveType: '4g', saveData: false },
        deviceMemory: 4,
        hardwareConcurrency: 8,
      },
    })

    expect(profile).toEqual({
      appVersion: '1.2.3',
      deviceMemoryGb: 4,
      effectiveType: '4g',
      hardwareConcurrency: 8,
      isStandalone: true,
      saveData: false,
    })
  })

  it('Safari (sem deviceMemory nem connection): os campos ficam ausentes, nunca inventados', async () => {
    const { buildDeviceProfile } = (await import(DEVICE_PROFILE_MODULE)) as DeviceProfileModule

    const profile = buildDeviceProfile({
      navigator: { hardwareConcurrency: 6 },
    })

    expect(profile).toEqual({ hardwareConcurrency: 6 })
    expect(Object.keys(profile)).toEqual(['hardwareConcurrency'])
  })

  it('navegador sem nada: perfil vazio, sem chave com undefined, null ou zero', async () => {
    const { buildDeviceProfile } = (await import(DEVICE_PROFILE_MODULE)) as DeviceProfileModule

    const profile = buildDeviceProfile({ navigator: {} })

    expect(profile).toEqual({})
    expect(JSON.stringify(profile)).toBe('{}')
  })
})

type Diagnosable = Readonly<{
  diagnostics: ClientDiagnostics
  collected: DiagnosticsBatch[]
  client: ReturnType<typeof createDriverTripClient>
  sendWithAttempt: (attempt: number) => Promise<string>
  slotRequests: string[]
}>

function buildReport(): Extract<DriverFieldReport, { kind: 'documentOccurrence' }> {
  return {
    documentId: 'document-1',
    idempotencyKey: 'chave-da-ocorrencia',
    kind: 'documentOccurrence',
    location: null,
    note: OBSERVATION_NOTE,
    occurrenceTypeId: 'type-1',
    occurrenceTypeName: 'Recusa total',
    photo: {
      blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      fileName: 'recusa.jpg',
    },
    productCode: '',
  }
}

type SendWithOptions = (
  stamped: Parameters<ReturnType<typeof createDriverTripClient>['send']>[0],
  options: { attempt: number },
) => Promise<void>

/** A API responde bem e o storage cai na rede: o cenário das 60 chamadas de produção. */
async function buildDiagnosable(input: {
  storage: () => Promise<Response>
  sendDiagnostics: (batch: DiagnosticsBatch) => Promise<DiagnosticsSendResult>
}): Promise<Diagnosable> {
  const { createClientDiagnostics } = await loadCollector()
  const collected: DiagnosticsBatch[] = []
  const slotRequests: string[] = []
  const diagnostics = createClientDiagnostics({
    send: (batch) => {
      collected.push(batch)
      return input.sendDiagnostics(batch)
    },
  })
  const client = createDriverTripClient({
    apiUrl: API,
    diagnostics,
    fetch: (request: RequestInfo | URL) => {
      const url = new URL((request as Request).url)
      if (url.origin === STORAGE_ORIGIN) return input.storage()
      if (url.pathname === SLOT_PATH) {
        slotRequests.push(url.pathname)
        return Promise.resolve(
          Response.json({ data: { id: UPLOAD_ID, uploadUrl: UPLOAD_URL } }, { status: 201 }),
        )
      }
      return Promise.resolve(Response.json({ data: { id: 'occurrence-1' } }, { status: 201 }))
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  } as unknown as Parameters<typeof createDriverTripClient>[0])

  const stamped = { report: buildReport(), stamp: undefined } as unknown as Parameters<
    typeof client.send
  >[0]
  async function sendWithAttempt(attempt: number): Promise<string> {
    try {
      await (client.send as unknown as SendWithOptions)(stamped, { attempt })
      return 'sent'
    } catch (error) {
      return toAttachmentSendOutcome(error).kind
    }
  }

  return { client, collected, diagnostics, sendWithAttempt, slotRequests }
}

const NETWORK_DOWN = () => Promise.reject(new TypeError('Failed to fetch'))

describe('o PUT que cai na rede deixa rastro (spec 254 CA1/RF1)', () => {
  it('três tentativas: send_failed em upload_put, failureKind network, attempt crescente', async () => {
    const harness = await buildDiagnosable({
      sendDiagnostics: () => Promise.resolve({ status: 204 }),
      storage: NETWORK_DOWN,
    })

    for (const attempt of [1, 2, 3]) {
      expect(await harness.sendWithAttempt(attempt)).toBe('failed-network')
    }
    await harness.diagnostics.flush()

    const failures = harness.collected
      .flatMap((batch) => batch.events)
      .filter((event) => event.eventKind === 'send_failed')
    expect(failures.map((event) => event.step)).toEqual(['upload_put', 'upload_put', 'upload_put'])
    expect(failures.map((event) => event.failureKind)).toEqual(['network', 'network', 'network'])
    expect(failures.map((event) => event.attempt)).toEqual([1, 2, 3])
    expect(failures.every((event) => event.httpStatus === undefined)).toBe(true)
    expect(failures.every((event) => event.reportKind === 'documentOccurrence')).toBe(true)
    expect(failures.every((event) => event.photoBytes === 3)).toBe(true)
  })

  it('503 do storage: failureKind http_status com o httpStatus', async () => {
    const harness = await buildDiagnosable({
      sendDiagnostics: () => Promise.resolve({ status: 204 }),
      storage: () => Promise.resolve(new Response(null, { status: 503 })),
    })

    await harness.sendWithAttempt(1)
    await harness.diagnostics.flush()

    const failure = harness.collected
      .flatMap((batch) => batch.events)
      .find((event) => event.eventKind === 'send_failed')
    expect(failure).toMatchObject({
      failureKind: 'http_status',
      httpStatus: 503,
      step: 'upload_put',
    })
  })

  it('o envio do diagnóstico pelo cliente não gera evento sobre si mesmo', async () => {
    const harness = await buildDiagnosable({
      sendDiagnostics: () => Promise.resolve({ status: 204 }),
      storage: NETWORK_DOWN,
    })
    const client = harness.client as unknown as {
      sendClientDiagnostics: (batch: DiagnosticsBatch) => Promise<unknown>
    }

    await client
      .sendClientDiagnostics({
        events: [{ ...buildInput(1), occurredAt: new Date().toISOString() }],
      })
      .catch(() => undefined)
    await harness.diagnostics.flush()

    expect(harness.collected).toHaveLength(0)
    expect(harness.slotRequests).toHaveLength(0)
  })
})

describe('falha ao enviar diagnóstico não mexe na baixa nem em attempts (spec 254 CA5)', () => {
  it('com o envio de diagnóstico caído, a fila registra as mesmas tentativas e o mesmo resultado', async () => {
    const { drainQueue, enqueueReport } = await import(
      '../../src/modules/driver-trip/shared/offlineQueue.service'
    )
    type Store = Parameters<typeof drainQueue>[0]['store']
    async function runDrains(sendDiagnostics: () => Promise<DiagnosticsSendResult>) {
      let items: Awaited<ReturnType<Store['read']>> = []
      const store: Store = {
        read: () => Promise.resolve(items),
        update: (mutate) => {
          items = mutate(items)
          return Promise.resolve(items)
        },
      }
      await enqueueReport({ now: new Date(), report: buildReport(), store })
      const harness = await buildDiagnosable({ sendDiagnostics, storage: NETWORK_DOWN })
      let attempt = 0
      const send: Parameters<typeof drainQueue>[0]['send'] = async (stamped) => {
        attempt += 1
        try {
          await (harness.client.send as unknown as SendWithOptions)(stamped, { attempt })
          return 'sent'
        } catch (error) {
          return toAttachmentSendOutcome(error).kind
        }
      }
      for (let tick = 0; tick < 4; tick += 1) {
        await drainQueue({ origin: 'immediate', send, store })
        await harness.diagnostics.flush()
      }
      return { attempts: items.map((item) => item.attempts), slots: harness.slotRequests.length }
    }

    const withDiagnosticsUp = await runDrains(() => Promise.resolve({ status: 204 }))
    const withDiagnosticsDown = await runDrains(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    )
    const withDiagnosticsRefused = await runDrains(() => Promise.resolve({ status: 429 }))

    expect(withDiagnosticsUp).toEqual({ attempts: [4], slots: 4 })
    expect(withDiagnosticsDown).toEqual(withDiagnosticsUp)
    expect(withDiagnosticsRefused).toEqual(withDiagnosticsUp)
  })
})

describe('nada que o coletor emite carrega dado pessoal (spec 254 RF4/CA2)', () => {
  it('a varredura do JSON de tudo que saiu não acha URL assinada, observação nem coordenada', async () => {
    const harness = await buildDiagnosable({
      sendDiagnostics: () => Promise.resolve({ status: 204 }),
      storage: NETWORK_DOWN,
    })

    for (const attempt of [1, 2]) await harness.sendWithAttempt(attempt)
    harness.diagnostics.record({
      ...buildInput(5),
      latitude: -23.55052,
      longitude: -46.633308,
      note: OBSERVATION_NOTE,
      signedUrl: UPLOAD_URL,
      uploadUrl: UPLOAD_URL,
    } as unknown as DiagnosticInput)
    await harness.diagnostics.flush()

    const emitted = JSON.stringify(harness.collected)
    expect(harness.collected.length).toBeGreaterThan(0)
    for (const forbidden of [
      'X-Amz-Signature',
      'assinatura-secreta',
      STORAGE_ORIGIN,
      'objeto-secreto',
      OBSERVATION_NOTE,
      'Recusa total',
      '-23.55052',
      '-46.633308',
      'latitude',
      'longitude',
    ]) {
      expect(emitted).not.toContain(forbidden)
    }
  })

  it('o evento só tem campos da lista permitida: campo livre do chamador é descartado', async () => {
    const { createClientDiagnostics } = await loadCollector()
    const { batches, send } = buildRecordingSender()
    const diagnostics = createClientDiagnostics({ send })

    diagnostics.record({
      ...buildInput(1),
      message: 'texto livre',
      responseBody: '<Error/>',
    } as unknown as DiagnosticInput)
    await diagnostics.flush()

    const allowed = new Set([
      'attachmentKey',
      'attempt',
      'durationMs',
      'eventKind',
      'failureKind',
      'httpStatus',
      'idempotencyKey',
      'occurredAt',
      'photoBytes',
      'reportKind',
      'step',
    ])
    const keys = Object.keys(batches[0]?.events[0] ?? {})
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.filter((key) => !allowed.has(key))).toEqual([])
  })
})
