/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'
import { buildDocumentOccurrenceReport } from '../../src/modules/driver-trip/shared/documentOccurrenceReport.service'
import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type {
  DriverFieldReport,
  DriverOccurrencePhoto,
  DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { buildEventQueueView } from '../../src/modules/driver-trip/shared/eventQueueView.service'
import {
  dispatchOccurrenceRegistration,
  type OccurrenceRegistrationHandlers,
} from '../../src/modules/driver-trip/shared/occurrenceDispatch.service'
import {
  enqueueReport,
  sumReportPhotoBytes,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'

/**
 * Spec 246 (T4.2, RF9, 209 D1): a assinatura da ocorrência entra no item de fila que já existe — o
 * `documentOccurrence` —, nunca num item novo nem no comprovante. Sobe pelo mesmo par de upload da
 * foto e vira `signatureObjectId` no corpo do mesmo `POST`; as fotos, uma ou várias, também.
 */
const API = 'https://api.test'
const DOCUMENT_ID = 'document-1'
const OCCURRENCE_PATH = `/me/trips/current/documents/${DOCUMENT_ID}/occurrences`

function image(input: { readonly bytes: number; readonly type: string }): DriverOccurrencePhoto {
  return {
    blob: new Blob([new Uint8Array(input.bytes)], { type: input.type }),
    fileName: `arquivo-${input.bytes}`,
  }
}
const PHOTO_ONE = image({ bytes: 11, type: 'image/jpeg' })
const PHOTO_TWO = image({ bytes: 12, type: 'image/jpeg' })
const PHOTO_THREE = image({ bytes: 13, type: 'image/jpeg' })
const SIGNATURE = image({ bytes: 21, type: 'image/png' })

type DocumentOccurrenceReport = Extract<DriverFieldReport, { kind: 'documentOccurrence' }>

function buildReport(overrides: Partial<DocumentOccurrenceReport> = {}): DocumentOccurrenceReport {
  return {
    documentId: DOCUMENT_ID,
    idempotencyKey: 'chave-da-ocorrencia',
    kind: 'documentOccurrence',
    location: null,
    note: 'Cliente recusou na porta',
    occurrenceTypeId: 'type-1',
    occurrenceTypeName: 'Recusa total',
    photo: PHOTO_ONE,
    productCode: '',
    ...overrides,
  }
}

/** O id do upload sai do tamanho declarado: casa cada arquivo com o objeto que o servidor "criou". */
function buildClient() {
  const seen: { readonly body: unknown; readonly method: string; readonly path: string }[] = []
  const client = createDriverTripClient({
    apiUrl: API,
    fetch: async (input) => {
      const request = input as Request
      const url = new URL(request.url)
      const text = await request.clone().text()
      seen.push({
        body: text === '' || url.origin !== API ? undefined : JSON.parse(text),
        method: request.method,
        path: url.pathname,
      })
      if (url.origin === 'https://storage.test') return new Response(null, { status: 200 })
      if (url.pathname.endsWith('/occurrence-uploads')) {
        const declared = JSON.parse(text) as { readonly sizeBytes: number }
        return Response.json(
          {
            data: {
              id: `objeto-${declared.sizeBytes}`,
              uploadUrl: `https://storage.test/bucket/objeto-${declared.sizeBytes}?X-Amz-Signature=a`,
            },
          },
          { status: 201 },
        )
      }
      if (url.pathname.endsWith('/confirm')) {
        const id = url.pathname.split('/').at(-2) ?? ''
        return Response.json({ data: { id } })
      }
      return Response.json({ data: { id: 'ocorrencia-1' } }, { status: 201 })
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
  return { client, seen }
}

function occurrenceBody(seen: ReturnType<typeof buildClient>['seen']): Record<string, unknown> {
  const posted = seen.find((entry) => entry.path === OCCURRENCE_PATH)
  return (posted?.body ?? {}) as Record<string, unknown>
}

describe('a assinatura é parte do mesmo item da ocorrência (T4.2, 209 D1)', () => {
  it('o toque gera um item só, com as fotos e a assinatura dentro', () => {
    const reports: DriverFieldReport[] = []
    const handlers: OccurrenceRegistrationHandlers = {
      enqueueDocumentOccurrence: (occurrence) =>
        reports.push(buildDocumentOccurrenceReport({ idempotencyKey: 'chave-1', occurrence })),
      reportStopOccurrence: () => undefined,
    }
    const type: DriverOccurrenceType = {
      flow: 'document',
      id: 'type-1',
      name: 'Recusa total',
      photoMinimumCount: 2,
      photoMode: 'required',
      signatureMode: 'required',
    }

    dispatchOccurrenceRegistration({
      documentId: DOCUMENT_ID,
      draft: { description: '', extraPhotos: [PHOTO_TWO], photo: PHOTO_ONE, signature: SIGNATURE },
      handlers,
      stopId: 'stop-1',
      type,
    })

    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      extraPhotos: [PHOTO_TWO],
      kind: 'documentOccurrence',
      photo: PHOTO_ONE,
      signature: SIGNATURE,
    })
  })

  it('o item sem assinatura nem fotos extras tem a forma de sempre — o gravado antes continua valendo', () => {
    const report = buildDocumentOccurrenceReport({
      idempotencyKey: 'chave-1',
      occurrence: {
        documentId: DOCUMENT_ID,
        note: 'x',
        occurrenceTypeId: 'type-1',
        occurrenceTypeName: 'Recusa',
        photo: PHOTO_ONE,
      },
    })

    expect(report).not.toHaveProperty('signature')
    expect(report).not.toHaveProperty('extraPhotos')
  })

  it('a assinatura e as fotos contam na cota de bytes e nos anexos do item, não como item novo', async () => {
    const report = buildReport({ extraPhotos: [PHOTO_TWO, PHOTO_THREE], signature: SIGNATURE })
    const queue = createMemoryQueue()

    await enqueueReport({ now: new Date('2026-10-06T10:00:00Z'), report, store: queue })

    expect(queue.items()).toHaveLength(1)
    expect(sumReportPhotoBytes([report])).toBe(11 + 12 + 13 + 21)
    const [view] = buildEventQueueView({ attachments: [], queued: queue.items() })
    expect(view?.attachmentCount).toBe(4)
    expect(view?.kind).toBe('documentOccurrence')
  })

  it('o formulário e a página não usam a captura nem a fila do comprovante para a assinatura', () => {
    const read = (path: string) =>
      readFileSync(new URL(`../../src/modules/driver-trip/${path}`, import.meta.url), 'utf8')

    const field = read('components/OccurrenceSignatureField.component.tsx')
    const hook = read('hooks/useOccurrenceSignature.hook.ts')
    const form = read('components/DriverOccurrenceRegistrationForm.component.tsx')
    const builder = read('shared/documentOccurrenceReport.service.ts')

    for (const source of [field, hook, form, builder]) {
      expect(source).not.toInclude('ProofCaptureFields')
      expect(source).not.toInclude('attachProof')
      expect(source).not.toInclude("kind: 'signature'")
    }
    expect(builder).toInclude('signature: occurrence.signature')
  })
})

describe('o envio sobe pelo mesmo par de upload e manda signatureObjectId (T4.2, RF9)', () => {
  it('uma foto e a assinatura: dois uploads, e o corpo leva attachmentObjectId e signatureObjectId', async () => {
    const { client, seen } = buildClient()

    await client.send({ report: buildReport({ signature: SIGNATURE }), stamp: undefined })

    const uploads = seen.filter((entry) => entry.path.endsWith('/occurrence-uploads'))
    expect(uploads.map((entry) => (entry.body as { mimeType: string }).mimeType).sort()).toEqual([
      'image/jpeg',
      'image/png',
    ])
    expect(occurrenceBody(seen)).toEqual({
      attachmentObjectId: 'objeto-11',
      location: null,
      note: 'Cliente recusou na porta',
      occurrenceTypeId: 'type-1',
      productCode: '',
      signatureObjectId: 'objeto-21',
    })
  })

  it('nada da assinatura passa pelo comprovante da nota', async () => {
    const { client, seen } = buildClient()

    await client.send({ report: buildReport({ signature: SIGNATURE }), stamp: undefined })

    expect(seen.filter((entry) => entry.path.includes('/proof'))).toHaveLength(0)
    expect(
      seen
        .filter((entry) => entry.method === 'POST' && !entry.path.includes('/confirm'))
        .every((entry) => entry.path.includes('/occurrence')),
    ).toBe(true)
  })

  it('várias fotos: a lista sai na ordem, e o campo único não vai junto (a API recusa os dois)', async () => {
    const { client, seen } = buildClient()

    await client.send({
      report: buildReport({ extraPhotos: [PHOTO_TWO, PHOTO_THREE] }),
      stamp: undefined,
    })

    const body = occurrenceBody(seen)
    expect(body.attachmentObjectIds).toEqual(['objeto-11', 'objeto-12', 'objeto-13'])
    expect(body).not.toHaveProperty('attachmentObjectId')
    expect(body).not.toHaveProperty('signatureObjectId')
  })

  it('só a assinatura, sem foto: o corpo leva signatureObjectId e nenhum campo de anexo', async () => {
    const { client, seen } = buildClient()

    await client.send({
      report: buildReport({ photo: null, signature: SIGNATURE }),
      stamp: undefined,
    })

    const body = occurrenceBody(seen)
    expect(body.signatureObjectId).toBe('objeto-21')
    expect(body).not.toHaveProperty('attachmentObjectId')
    expect(body).not.toHaveProperty('attachmentObjectIds')
  })

  it('o item antigo, só com a foto, sai exatamente como saía', async () => {
    const { client, seen } = buildClient()

    await client.send({ report: buildReport(), stamp: undefined })

    expect(occurrenceBody(seen)).toEqual({
      attachmentObjectId: 'objeto-11',
      location: null,
      note: 'Cliente recusou na porta',
      occurrenceTypeId: 'type-1',
      productCode: '',
    })
  })
})
