/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  DriverTripRequestError,
  toAttachmentSendOutcome,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import { PROOF_ORIGINAL_MAX_BYTES } from '@/modules/driver-trip/shared/proofPhotoReduction.service'
import {
  createProofUploadProgressStore,
  proofProgressKey,
  readProofProcessingState,
  resolveUploadPercent,
} from '@/modules/driver-trip/shared/proofUploadProgress.service'
import { resolveProofUploadStatus } from '@/modules/driver-trip/shared/proofUploadStatus.service'

const KEY = proofProgressKey({ documentId: 'document-1', kind: 'photo' })

class FakeXhr {
  public static last: FakeXhr | undefined
  public readonly headers: Record<string, string> = {}
  public method = ''
  public onabort: (() => void) | null = null
  public onerror: (() => void) | null = null
  public onload: (() => void) | null = null
  public ontimeout: (() => void) | null = null
  public readonly upload: {
    onload: (() => void) | null
    onprogress:
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | null
  } = { onload: null, onprogress: null }
  public responseText = ''
  public sentBody: unknown
  public status = 0
  public url = ''
  public wasAborted = false
  private readonly responseHeaders: Record<string, string> = {}

  public constructor() {
    FakeXhr.last = this
  }

  public abort(): void {
    this.wasAborted = true
    this.onabort?.()
  }

  public getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null
  }

  public open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  public respond(status: number, body: string, headers: Record<string, string> = {}): void {
    this.status = status
    this.responseText = body
    for (const [name, value] of Object.entries(headers)) {
      this.responseHeaders[name.toLowerCase()] = value
    }
    this.onload?.()
  }

  public send(body: unknown): void {
    this.sentBody = body
  }

  public setRequestHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value
  }

  public progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
}

function xhrClient(extra: { fetchCalls?: number[] } = {}) {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    createXhr: () => new FakeXhr() as unknown as XMLHttpRequest,
    fetch: () => {
      extra.fetchCalls?.push(1)
      return Promise.reject(new Error('FETCH_NOT_EXPECTED'))
    },
    getAccessToken: () => Promise.resolve('token-abc'),
  })
}

function photo(bytes = 2 * 1024 * 1024): File {
  return new File([new Uint8Array(bytes)], 'IMG.jpg', { type: 'image/jpeg' })
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
}

describe('spec 265 RF12: a porcentagem é de bytes enviados / total', () => {
  it('resolveUploadPercent: inteira, nunca 100 antes de terminar, nunca negativa', () => {
    expect(resolveUploadPercent({ loaded: 0, total: 1000 })).toBe(0)
    expect(resolveUploadPercent({ loaded: 250, total: 1000 })).toBe(25)
    expect(resolveUploadPercent({ loaded: 1000, total: 1000 })).toBe(99)
    expect(resolveUploadPercent({ isDone: true, loaded: 1000, total: 1000 })).toBe(100)
    expect(resolveUploadPercent({ loaded: -5, total: 1000 })).toBe(0)
    expect(resolveUploadPercent({ loaded: 5, total: 0 })).toBe(0)
  })

  it('o progresso é monotônico: medida menor que a anterior não faz a barra recuar', () => {
    const store = createProofUploadProgressStore()
    store.begin(KEY)
    const seen: number[] = []
    store.subscribe(() => seen.push(store.get(KEY)?.percent ?? -1))

    store.report(KEY, { loaded: 400, total: 1000 })
    store.report(KEY, { loaded: 300, total: 1000 })
    store.report(KEY, { loaded: 900, total: 1000 })
    store.accepted(KEY, undefined)

    expect(seen).toEqual([40, 90, 100])
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('o envio novo começa do zero e a recusa apaga a barra', () => {
    const store = createProofUploadProgressStore()
    store.begin(KEY)
    store.report(KEY, { loaded: 900, total: 1000 })
    store.begin(KEY)
    expect(store.get(KEY)?.percent).toBe(0)
    store.clear(KEY)
    expect(store.get(KEY)).toBeUndefined()
  })

  it('só received/processing viram aviso; ready e campo ausente não dizem nada', () => {
    expect(readProofProcessingState('received')).toBe('received')
    expect(readProofProcessingState('processing')).toBe('processing')
    expect(readProofProcessingState('ready')).toBeUndefined()
    expect(readProofProcessingState('processing_failed')).toBeUndefined()
    expect(readProofProcessingState(undefined)).toBeUndefined()
  })
})

describe('spec 265 RF12: o comprovante sobe por XMLHttpRequest com progresso', () => {
  it('reporta bytes enviados em ordem crescente até 100% e devolve o resultado do servidor', async () => {
    const client = xhrClient()
    const progress: Array<{ loaded: number; total: number }> = []

    const pending = client.attachProof({
      attachmentKey: 'key-1',
      documentId: 'document-1',
      file: photo(),
      kind: 'photo',
      onUploadProgress: (event) => progress.push(event),
    })
    await flushMicrotasks()
    const xhr = FakeXhr.last
    if (xhr === undefined) throw new Error('XHR_MISSING')
    xhr.progress(100, 1000)
    xhr.progress(600, 1000)
    xhr.progress(1000, 1000)
    xhr.upload.onload?.()
    xhr.respond(
      201,
      '{"data":{"id":"p1","processingState":"processing","punctuality":"not_required"}}',
      { 'content-type': 'application/json' },
    )

    const result = await pending
    expect(result).toEqual({ id: 'p1', processingState: 'processing', punctuality: 'not_required' })
    expect(progress.map((item) => item.loaded)).toEqual([100, 600, 1000, 1000])
    expect(progress.every((item) => item.total === 1000)).toBe(true)
    const store = createProofUploadProgressStore()
    store.begin(KEY)
    const percents: number[] = []
    for (const item of progress) {
      store.report(KEY, item)
      percents.push(store.get(KEY)?.percent ?? 0)
    }
    expect([...percents].sort((a, b) => a - b)).toEqual(percents)
    expect(Math.max(...percents)).toBeLessThanOrEqual(99)
  })

  it('leva o token, a rota, o multipart e a variante; o fetch não é usado', async () => {
    const fetchCalls: number[] = []
    const client = xhrClient({ fetchCalls })
    const pending = client.attachProof({
      documentId: 'document-1',
      file: photo(),
      kind: 'photo',
      onUploadProgress: () => undefined,
    })
    await flushMicrotasks()
    const xhr = FakeXhr.last
    if (xhr === undefined) throw new Error('XHR_MISSING')

    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('https://api.test/me/trips/current/documents/document-1/proof')
    expect(xhr.headers.authorization).toBe('Bearer token-abc')
    expect((xhr.sentBody as FormData).get('variant')).toBe('original')
    expect((xhr.sentBody as FormData).get('kind')).toBe('photo')
    xhr.respond(201, '{"data":{"id":"p1","punctuality":"not_required"}}')
    await pending
    expect(fetchCalls).toEqual([])
  })

  it('sem callback de progresso o envio segue pelo fetch, como antes', async () => {
    const calls: Request[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      createXhr: () => {
        throw new Error('XHR_NOT_EXPECTED')
      },
      fetch: (input) => {
        calls.push(input as Request)
        return Promise.resolve(
          new Response('{"data":{"id":"p1","punctuality":"not_required"}}', { status: 201 }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    await client.attachProof({ documentId: 'document-1', file: photo(), kind: 'photo' })

    expect(calls).toHaveLength(1)
  })

  it('4xx vira recusa com status e código; 5xx e 429 continuam tentáveis (rede)', async () => {
    const refused = xhrClient().attachProof({
      documentId: 'document-1',
      file: photo(),
      kind: 'photo',
      onUploadProgress: () => undefined,
    })
    await flushMicrotasks()
    FakeXhr.last?.respond(422, '{"error":{"code":"TRIP_DELIVERY_PROOF_TOO_LARGE","message":"x"}}', {
      'content-type': 'application/json',
    })
    const error: unknown = await refused.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DriverTripRequestError)
    expect(toAttachmentSendOutcome(error)).toMatchObject({
      cause: '422 TRIP_DELIVERY_PROOF_TOO_LARGE',
      kind: 'rejected',
    })

    const unavailable = xhrClient().attachProof({
      documentId: 'document-1',
      file: photo(),
      kind: 'photo',
      onUploadProgress: () => undefined,
    })
    await flushMicrotasks()
    FakeXhr.last?.respond(503, '<html>bad gateway</html>')
    expect(toAttachmentSendOutcome(await unavailable.catch((caught: unknown) => caught))).toEqual({
      kind: 'failed-network',
    })
  })

  it('rede caída (onerror) é offline: o item volta para a fila', async () => {
    const pending = xhrClient().attachProof({
      documentId: 'document-1',
      file: photo(),
      kind: 'photo',
      onUploadProgress: () => undefined,
    })
    await flushMicrotasks()
    FakeXhr.last?.onerror?.()

    const error: unknown = await pending.catch((caught: unknown) => caught)
    expect(toAttachmentSendOutcome(error)).toEqual({ kind: 'failed-network' })
  })

  it('o original acima de 12 MiB nem abre a conexão', async () => {
    FakeXhr.last = undefined
    const error: unknown = await xhrClient()
      .attachProof({
        documentId: 'document-1',
        file: photo(PROOF_ORIGINAL_MAX_BYTES + 1),
        kind: 'photo',
        onUploadProgress: () => undefined,
      })
      .catch((caught: unknown) => caught)

    expect(toAttachmentSendOutcome(error)).toMatchObject({ kind: 'rejected' })
    expect(FakeXhr.last).toBeUndefined()
  })
})

describe('spec 265 RF10/RF12: o estado da tela', () => {
  it('na fila o estado continua "uploading" e o servidor aceitar não regride o "sent"', () => {
    const base = { isAttached: true, isQueued: true, isRejected: false }
    expect(
      resolveProofUploadStatus({
        observation: base,
        tracker: { hasBeenQueued: true, sentAt: undefined },
      }),
    ).toBe('uploading')
    expect(
      resolveProofUploadStatus({
        observation: { ...base, isQueued: false },
        tracker: { hasBeenQueued: true, sentAt: '2026-10-14T12:00:00.000Z' },
      }),
    ).toBe('sent')
  })

  it('na fila a barra aparece em 0% (nenhum byte saiu) e a nuvem só anima com porcentagem real', () => {
    const root = resolve(import.meta.dir, '../../src/modules/driver-trip')
    const component = readFileSync(`${root}/components/ProofUploadStatus.component.tsx`, 'utf8')
    expect(component).toContain('<ProofUploadProgressBar percent={upload.uploadPercent ?? 0} />')
    expect(component).toContain('upload.uploadPercent === undefined ? (')
  })

  it('o componente mostra a barra, o aviso "processando" e as chaves existem nos dois idiomas', () => {
    const root = resolve(import.meta.dir, '../../src/modules/driver-trip')
    const component = readFileSync(`${root}/components/ProofUploadStatus.component.tsx`, 'utf8')
    expect(component).toContain('role="progressbar"')
    expect(component).toContain('proofCapture.upload.sentProcessing')
    for (const file of ['driverTrip.locale.json', 'driverTrip.en.locale.json']) {
      const locale = JSON.parse(readFileSync(`${root}/locales/${file}`, 'utf8')) as {
        proofCapture: { upload: Record<string, string> }
      }
      const { upload } = locale.proofCapture
      expect(upload.sentProcessing).toBeDefined()
      expect(upload.uploadingPercent).toContain('{{percent}}')
      expect(upload.uploadingProgress).toBeDefined()
      expect(upload.sent).toContain('{{time}}')
    }
  })
})
