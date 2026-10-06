/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão final, M1): a assinatura não pode ser, ao mesmo tempo, um anexo. O mesmo upload
 * confirmado mandado em `signatureObjectId` e em `attachmentObjectId(s)` viraria linha de anexo de foto
 * (conta no mínimo de fotos, entra no demonstrativo e no expurgo) além de assinatura — a regra "só em
 * `signature_object_id`" (RF9) furada pelo próprio corpo. A recusa é 400 estável: no schema da rota e
 * no caso de uso (que o WhatsApp e os testes também chamam).
 */
import { describe, expect, test } from 'bun:test'

import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { TripOccurrenceSignatureIsAttachmentError } from '../../src/trips/domain/trip.error.js'
import { parseRegisterOccurrenceRequest } from '../../src/trips/presentation/occurrence.schema.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const PHOTO = '00000000-0000-4000-8000-0000000000f1'
const OTHER_PHOTO = '00000000-0000-4000-8000-0000000000f2'
const SIGNATURE = '00000000-0000-4000-8000-0000000000f3'

function jsonRequest(body: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/x', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

type Registration = {
  readonly attachmentObjectId?: string | null
  readonly attachmentObjectIds?: readonly string[]
  readonly signatureObjectId: string
}

function register(input: Registration) {
  const state = createFieldReportState({
    documents: new Map([
      [
        DOCUMENT,
        { separationStatus: 'pending', stopId: null, tripId: '', tripStatus: 'on_delivery_route' },
      ],
    ]),
  })
  const result = registerDriverOccurrence({
    actorUserId: '00000000-0000-4000-8000-00000000000f',
    attachmentObjectId: input.attachmentObjectId ?? null,
    ...(input.attachmentObjectIds === undefined
      ? {}
      : { attachmentObjectIds: input.attachmentObjectIds }),
    companyId: COMPANY,
    documentId: DOCUMENT,
    driverId: '00000000-0000-4000-8000-00000000000d',
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente ausente',
    occurrenceTypeId: TYPE_ID,
    productCode: '',
    repository: {
      findConfirmedUpload: async (query) =>
        [PHOTO, OTHER_PHOTO, SIGNATURE].includes(query.id) ? { id: query.id } : null,
      findOccurrenceType: async () => ({
        active: true,
        allowsMultipleItems: true,
        attachmentMode: 'optional',
        emailBody: '',
        emailSubject: '',
        emailTemplateKey: null,
        id: TYPE_ID,
        name: 'Recusa total',
        noteMode: 'optional',
        notifies: false,
        photoMinimumCount: 1,
        signatureMode: 'optional',
        stage: 'delivery',
      }),
      findOccurrenceTypeOverrides: async () => ({
        contractorOverrides: [],
        recipientOverrides: [],
      }),
      findReachableDocument: async () => ({
        contractorId: null,
        recipientTaxId: null,
        tripId: TRIP,
      }),
      listDocumentProducts: async () => [],
    },
    signatureObjectId: input.signatureObjectId,
    unitOfWork: createFieldReportUnitOfWork(state),
  })
  return { result, state }
}

describe('a assinatura não é também um anexo (spec 246, revisão final M1)', () => {
  test('o schema da rota recusa o mesmo uuid na assinatura e no anexo único, com 400', async () => {
    const error = await rejection(
      parseRegisterOccurrenceRequest(
        jsonRequest({
          attachmentObjectId: PHOTO,
          occurrenceTypeId: TYPE_ID,
          signatureObjectId: PHOTO,
        }),
      ),
    )

    expect((error as { status?: number }).status).toBe(400)
  })

  test('o schema da rota recusa o uuid da assinatura dentro da lista de anexos, com 400', async () => {
    const error = await rejection(
      parseRegisterOccurrenceRequest(
        jsonRequest({
          attachmentObjectIds: [OTHER_PHOTO, SIGNATURE],
          occurrenceTypeId: TYPE_ID,
          signatureObjectId: SIGNATURE,
        }),
      ),
    )

    expect((error as { status?: number }).status).toBe(400)
  })

  test('uuids distintos entre foto e assinatura seguem valendo no schema', async () => {
    const body = await parseRegisterOccurrenceRequest(
      jsonRequest({
        attachmentObjectIds: [PHOTO, OTHER_PHOTO],
        occurrenceTypeId: TYPE_ID,
        signatureObjectId: SIGNATURE,
      }),
    )

    expect(body.signatureObjectId).toBe(SIGNATURE)
  })

  test('o caso de uso recusa a assinatura repetida no anexo único, antes de gravar', async () => {
    const { result, state } = register({
      attachmentObjectId: SIGNATURE,
      signatureObjectId: SIGNATURE,
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceSignatureIsAttachmentError)
    expect((error as TripOccurrenceSignatureIsAttachmentError).code).toBe(
      'TRIP_OCCURRENCE_SIGNATURE_IS_ATTACHMENT',
    )
    expect((error as TripOccurrenceSignatureIsAttachmentError).status).toBe(400)
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('o caso de uso recusa a assinatura repetida na lista de anexos, antes de gravar', async () => {
    const { result, state } = register({
      attachmentObjectIds: [PHOTO, SIGNATURE],
      signatureObjectId: SIGNATURE,
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceSignatureIsAttachmentError)
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('foto e assinatura distintas registram', async () => {
    const { result, state } = register({ attachmentObjectId: PHOTO, signatureObjectId: SIGNATURE })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })
})
