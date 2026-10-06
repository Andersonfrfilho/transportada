/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.3 (RF3, RF6, RF8, CA03): o registro do motorista lê os modos **efetivos** da nota —
 * tipo + exceção do contratante + exceção do destinatário, resolvidos por `resolveWithOverrides` — e
 * cobra cada campo pelo seu modo: a observação deixou de ser arrastada pela foto, a assinatura tem o
 * seu erro estável, e uma exceção afrouxa ou endurece de verdade. O contratante e o destinatário vêm
 * **da nota no servidor** (`findReachableDocument`), nunca do corpo.
 */
import { describe, expect, test } from 'bun:test'

import type { FieldOccurrenceTypeOverrides } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrenceSignatureRequiredError,
} from '../../src/trips/domain/trip.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const UPLOAD = '00000000-0000-4000-8000-0000000000f1'
const SIGNATURE = '00000000-0000-4000-8000-0000000000f2'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000c1'
const RECIPIENT_TAX_ID = '12345678000190'
const OTHER_RECIPIENT_TAX_ID = '99999999000199'

type Registration = {
  readonly attachmentObjectId?: string | null
  readonly contractorId?: string | null
  readonly note?: string
  readonly overrides?: FieldOccurrenceTypeOverrides
  readonly recipientTaxId?: string | null
  readonly signatureObjectId?: string | null
  readonly type: Partial<OccurrenceTypeRecord>
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
    companyId: COMPANY,
    documentId: DOCUMENT,
    driverId: '00000000-0000-4000-8000-00000000000d',
    idempotencyKey: crypto.randomUUID(),
    note: input.note ?? '',
    occurrenceTypeId: TYPE_ID,
    productCode: '',
    repository: {
      findConfirmedUpload: async (query) =>
        query.id === UPLOAD || query.id === SIGNATURE ? { id: query.id } : null,
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
        signatureMode: 'off',
        stage: 'delivery',
        ...input.type,
      }),
      findOccurrenceTypeOverrides: async () =>
        input.overrides ?? { contractorOverrides: [], recipientOverrides: [] },
      findReachableDocument: async () => ({
        contractorId: input.contractorId ?? null,
        recipientTaxId: input.recipientTaxId ?? null,
        tripId: TRIP,
      }),
      listDocumentProducts: async () => [],
    },
    signatureObjectId: input.signatureObjectId ?? null,
    unitOfWork: createFieldReportUnitOfWork(state),
  })
  return { result, state }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('cada campo é cobrado pelo seu modo (spec 246 T2.3, RF3, RF8)', () => {
  test('observação obrigatória sem foto obrigatória: sem nota, 422 NOTE_REQUIRED', async () => {
    const { result, state } = register({
      type: { attachmentMode: 'optional', noteMode: 'required' },
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceNoteRequiredError)
    expect((error as TripOccurrenceNoteRequiredError).code).toBe('TRIP_OCCURRENCE_NOTE_REQUIRED')
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('foto obrigatória com observação opcional: a nota deixa de ser arrastada pela foto', async () => {
    const { result, state } = register({
      attachmentObjectId: UPLOAD,
      type: { attachmentMode: 'required', noteMode: 'optional' },
    })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })

  test('foto obrigatória sem anexo e com nota: 422 ATTACHMENT_REQUIRED', async () => {
    const { result } = register({
      note: 'cliente recusou',
      type: { attachmentMode: 'required', noteMode: 'optional' },
    })

    expect(await rejection(result)).toBeInstanceOf(TripOccurrenceAttachmentRequiredError)
  })

  test('assinatura obrigatória sem assinatura: erro estável próprio, nada gravado', async () => {
    const { result, state } = register({
      note: 'cliente recusou',
      type: { signatureMode: 'required' },
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrenceSignatureRequiredError)
    expect((error as TripOccurrenceSignatureRequiredError).status).toBe(422)
    expect((error as TripOccurrenceSignatureRequiredError).code).toBe(
      'TRIP_OCCURRENCE_SIGNATURE_REQUIRED',
    )
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('assinatura obrigatória com assinatura grava; opcional e desligada não a exigem', async () => {
    const signed = register({ signatureObjectId: SIGNATURE, type: { signatureMode: 'required' } })
    const optional = register({ type: { signatureMode: 'optional' } })
    const off = register({ type: { signatureMode: 'off' } })

    await Promise.all([signed.result, optional.result, off.result])

    expect(signed.state.documentOccurrences.size).toBe(1)
    expect(optional.state.documentOccurrences.size).toBe(1)
    expect(off.state.documentOccurrences.size).toBe(1)
  })
})

describe('a exceção da nota afrouxa ou endurece de verdade (spec 246 RF6, CA03)', () => {
  const overrides: FieldOccurrenceTypeOverrides = {
    contractorOverrides: [
      {
        attachmentMode: 'optional',
        contractorId: CONTRACTOR,
        noteMode: 'optional',
        occurrenceTypeId: TYPE_ID,
      },
    ],
    recipientOverrides: [
      {
        attachmentMode: 'required',
        noteMode: 'required',
        occurrenceTypeId: TYPE_ID,
        taxId: RECIPIENT_TAX_ID,
      },
    ],
  }

  test('exceção do destinatário mais estrita que o tipo: o servidor cobra a foto dela', async () => {
    const { result } = register({
      note: 'cliente recusou',
      overrides,
      recipientTaxId: RECIPIENT_TAX_ID,
      type: { attachmentMode: 'optional' },
    })

    expect(await rejection(result)).toBeInstanceOf(TripOccurrenceAttachmentRequiredError)
  })

  test('outro destinatário no mesmo tipo volta ao modo do tipo', async () => {
    const { result, state } = register({
      overrides,
      recipientTaxId: OTHER_RECIPIENT_TAX_ID,
      type: { attachmentMode: 'optional' },
    })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })

  test('exceção do contratante menos estrita afrouxa o tipo obrigatório', async () => {
    const { result, state } = register({
      contractorId: CONTRACTOR,
      overrides,
      type: { attachmentMode: 'required', noteMode: 'required' },
    })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })

  test('destinatário vence contratante', async () => {
    const { result } = register({
      contractorId: CONTRACTOR,
      overrides,
      recipientTaxId: RECIPIENT_TAX_ID,
      type: { attachmentMode: 'optional' },
    })

    expect(await rejection(result)).toBeInstanceOf(TripOccurrenceNoteRequiredError)
  })

  test('tipo sem exceção cobra exatamente o que cobrava', async () => {
    const { result } = register({
      note: 'x',
      type: { attachmentMode: 'required', noteMode: 'required' },
    })

    expect(await rejection(result)).toBeInstanceOf(TripOccurrenceAttachmentRequiredError)
  })
})
