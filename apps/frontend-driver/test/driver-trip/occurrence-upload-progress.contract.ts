/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  type OccurrenceUploadObserver,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '@/modules/driver-trip/shared/driverTrip.types'
import { occurrenceProgressKey } from '@/modules/driver-trip/shared/proofUploadProgress.service'

const UPLOAD_ID = '00000000-0000-4000-8000-0000000000a1'
const UPLOAD_URL = 'https://storage.test/bucket/objeto?X-Amz-Signature=assinatura'

class PutXhr {
  public static all: PutXhr[] = []
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
  public method = ''
  public constructor() {
    PutXhr.all.push(this)
  }
  public abort(): void {
    this.onabort?.()
  }
  public getResponseHeader(): string | null {
    return null
  }
  public open(method: string): void {
    this.method = method
  }
  public send(body: unknown): void {
    this.sentBody = body
  }
  public setRequestHeader(): void {}
  public progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }
  public respond(status: number): void {
    this.status = status
    this.onload?.()
  }
}

function report(
  overrides: Partial<Extract<DriverFieldReport, { kind: 'documentOccurrence' }>> = {},
): Extract<DriverFieldReport, { kind: 'documentOccurrence' }> {
  return {
    documentId: 'document-1',
    idempotencyKey: 'chave-1',
    kind: 'documentOccurrence',
    location: null,
    note: 'Recusa',
    occurrenceTypeId: 'type-1',
    occurrenceTypeName: 'Recusa total',
    photo: { blob: new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }), fileName: 'a.jpg' },
    productCode: '',
    ...overrides,
  }
}

function apiFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL((input as Request).url)
  if (url.pathname.endsWith('/occurrence-uploads'))
    return Promise.resolve(
      Response.json({ data: { id: UPLOAD_ID, uploadUrl: UPLOAD_URL } }, { status: 201 }),
    )
  if (url.pathname.endsWith('/confirm'))
    return Promise.resolve(Response.json({ data: { id: UPLOAD_ID } }))
  return Promise.resolve(Response.json({ data: { id: 'occurrence-1' } }, { status: 201 }))
}

function observe() {
  const events: string[] = []
  const observer: OccurrenceUploadObserver = {
    done: (key) => events.push(`done ${key}`),
    fail: (key, failure) => events.push(`fail ${key} ${failure.kind}`),
    progress: (key, progress) =>
      events.push(`progress ${key} ${progress.loaded}/${progress.total}`),
    start: (key) => events.push(`start ${key}`),
  }
  return { events, observer }
}

async function until(condition: () => boolean): Promise<void> {
  for (let index = 0; index < 50 && !condition(); index += 1)
    await new Promise((r) => setTimeout(r, 0))
}

describe('o envio da ocorrência de nota informa a barra e o motivo da falha', () => {
  it('a chave da barra não colide com a de um anexo', () => {
    expect(occurrenceProgressKey('chave-1')).toBe('occurrence:chave-1')
  })

  it('soma os bytes de todos os arquivos e termina em done', async () => {
    PutXhr.all = []
    const { events, observer } = observe()
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      createXhr: () => new PutXhr() as unknown as XMLHttpRequest,
      fetch: apiFetch,
      getAccessToken: () => Promise.resolve('t'),
      occurrenceUpload: observer,
    })
    const sending = client.send({
      report: report({
        signature: { blob: new Blob([new Uint8Array(1000)], { type: 'image/png' }) },
      } as never),
      stamp: undefined,
    })
    await until(() => PutXhr.all.length === 2)
    PutXhr.all[0]?.progress(500, 1000)
    PutXhr.all[1]?.progress(1000, 1000)
    PutXhr.all[0]?.progress(1000, 1000)
    PutXhr.all[0]?.respond(200)
    PutXhr.all[1]?.respond(200)
    await sending

    expect(events[0]).toBe('start chave-1')
    expect(events).toContain('progress chave-1 500/2000')
    expect(events).toContain('progress chave-1 1500/2000')
    expect(events).toContain('progress chave-1 2000/2000')
    expect(events.at(-1)).toBe('done chave-1')
    expect(PutXhr.all[0]?.method).toBe('PUT')
  })

  it('a falha de rede no PUT chega como motivo', async () => {
    PutXhr.all = []
    const { events, observer } = observe()
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      createXhr: () => new PutXhr() as unknown as XMLHttpRequest,
      fetch: apiFetch,
      getAccessToken: () => Promise.resolve('t'),
      occurrenceUpload: observer,
    })
    const sending = client.send({ report: report(), stamp: undefined })
    await until(() => PutXhr.all.length === 1)
    PutXhr.all[0]?.onerror?.()
    await sending.catch(() => undefined)

    expect(events.some((event) => event.startsWith('fail chave-1'))).toBe(true)
  })

  it('sem XHR, o envio segue pelo fetch e o resultado é o mesmo', async () => {
    const { events, observer } = observe()
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) =>
        new URL((input as Request).url).origin === 'https://storage.test'
          ? Promise.resolve(new Response(null, { status: 200 }))
          : apiFetch(input),
      getAccessToken: () => Promise.resolve('t'),
      occurrenceUpload: observer,
    })
    await client.send({ report: report(), stamp: undefined })

    expect(events).toEqual(['start chave-1', 'done chave-1'])
  })
})
