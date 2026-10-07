/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.4 (RF1, D-a, RF9, RF2b da 179): o cadastro do tipo e as duas exceções aceitam
 * `noteMode`/`signatureMode` (e, nas exceções, os seis campos, nulo = herda); ausente é "não mexa" —
 * nunca `?? 'x'` no `UPDATE`. A rota do motorista aceita `signatureObjectId`, e o caso de uso o confere
 * como confere o anexo (existe, é desta empresa e desta viagem, e é **do motorista**), gravando-o na
 * coluna própria, nunca como linha de anexo de foto.
 */
import { describe, expect, test } from 'bun:test'

import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import { TripOccurrenceUploadNotReachableError } from '../../src/trips/domain/trip.error.js'
import {
  parseOccurrenceAttachmentOverridesRequest,
  parseOccurrenceTypeRequest,
  parseRegisterOccurrenceRequest,
} from '../../src/trips/presentation/occurrence.schema.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const SIGNATURE = '00000000-0000-4000-8000-0000000000f2'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000c1'

function jsonRequest(body: Readonly<Record<string, unknown>>): Request {
  return new Request('http://localhost/x', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function statusOf(promise: Promise<unknown>): Promise<number | undefined> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  return (error as { status?: number } | undefined)?.status
}

const TYPE_BODY = {
  emailTemplateKey: null,
  flow: 'document',
  name: 'Recusa total',
  occurrenceTypeId: TYPE_ID,
  stage: 'delivery',
}

describe('o PUT do catálogo aceita os modos da observação e da assinatura (spec 246 T2.4)', () => {
  test('aceita noteMode e signatureMode, e o mapper os repassa ao caso de uso', async () => {
    const body = await parseOccurrenceTypeRequest(
      jsonRequest({ ...TYPE_BODY, noteMode: 'required', signatureMode: 'optional' }),
    )

    expect(body.noteMode).toBe('required')
    expect(body.signatureMode).toBe('optional')
    expect(toSaveOccurrenceTypeValues(body)).toMatchObject({
      noteMode: 'required',
      signatureMode: 'optional',
    })
  })

  test('ausente fica ausente — "não mexa", sem padrão escondido', async () => {
    const body = await parseOccurrenceTypeRequest(jsonRequest(TYPE_BODY))

    expect(body.noteMode).toBeUndefined()
    expect(body.signatureMode).toBeUndefined()
  })

  test('valor fora do vocabulário ou nulo é 400', async () => {
    for (const extra of [{ noteMode: 'always' }, { signatureMode: null }, { noteMode: 1 }]) {
      expect(
        await statusOf(parseOccurrenceTypeRequest(jsonRequest({ ...TYPE_BODY, ...extra }))),
      ).toBe(400)
    }
  })
})

describe('o PUT das exceções aceita os seis campos, nulo herda (spec 246 T2.4, D-a)', () => {
  const contractor = { attachmentMode: 'required', contractorId: CONTRACTOR }
  const recipient = { attachmentMode: 'optional', taxId: '12345678000190' }

  test('aceita os campos novos, nulos incluídos, nas duas listas', async () => {
    const body = await parseOccurrenceAttachmentOverridesRequest(
      jsonRequest({
        contractorOverrides: [
          {
            ...contractor,
            itemsMinimumCount: null,
            itemsMode: 'required',
            noteMode: null,
            photoMinimumCount: 3,
            signatureMode: 'required',
          },
        ],
        recipientOverrides: [{ ...recipient, noteMode: 'off', signatureMode: null }],
      }),
    )

    expect(body.contractorOverrides[0]).toMatchObject({
      itemsMinimumCount: null,
      itemsMode: 'required',
      noteMode: null,
      photoMinimumCount: 3,
      signatureMode: 'required',
    })
    expect(body.recipientOverrides[0]).toMatchObject({ noteMode: 'off', signatureMode: null })
  })

  test('o corpo antigo, só com a foto, continua valendo e deixa os campos ausentes', async () => {
    const body = await parseOccurrenceAttachmentOverridesRequest(
      jsonRequest({ contractorOverrides: [contractor], recipientOverrides: [recipient] }),
    )

    expect(body.contractorOverrides[0]?.noteMode).toBeUndefined()
    expect(body.recipientOverrides[0]?.signatureMode).toBeUndefined()
  })

  test('mínimo de produtos sem items_mode required é 400, como a CHECK do banco', async () => {
    for (const extra of [
      { itemsMinimumCount: 2 },
      { itemsMinimumCount: 2, itemsMode: 'optional' },
      { itemsMinimumCount: 2, itemsMode: null },
    ]) {
      expect(
        await statusOf(
          parseOccurrenceAttachmentOverridesRequest(
            jsonRequest({
              contractorOverrides: [{ ...contractor, ...extra }],
              recipientOverrides: [],
            }),
          ),
        ),
      ).toBe(400)
    }
  })

  test('mínimo de fotos fora de 1..5 e modo inválido são 400', async () => {
    for (const extra of [
      { photoMinimumCount: 0 },
      { photoMinimumCount: 6 },
      { noteMode: 'sometimes' },
      { itemsMode: 5 },
    ]) {
      expect(
        await statusOf(
          parseOccurrenceAttachmentOverridesRequest(
            jsonRequest({
              contractorOverrides: [{ ...contractor, ...extra }],
              recipientOverrides: [],
            }),
          ),
        ),
      ).toBe(400)
    }
  })
})

describe('a rota do motorista aceita a assinatura (spec 246 T2.4, RF9)', () => {
  const body = { occurrenceTypeId: TYPE_ID }

  test('signatureObjectId é um uuid; ausente e nulo valem', async () => {
    const withSignature = await parseRegisterOccurrenceRequest(
      jsonRequest({ ...body, signatureObjectId: SIGNATURE }),
    )
    const withNull = await parseRegisterOccurrenceRequest(
      jsonRequest({ ...body, signatureObjectId: null }),
    )
    const without = await parseRegisterOccurrenceRequest(jsonRequest(body))

    expect(withSignature.signatureObjectId).toBe(SIGNATURE)
    expect(withNull.signatureObjectId ?? null).toBeNull()
    expect(without.signatureObjectId ?? null).toBeNull()
  })

  test('uuid inválido é 400', async () => {
    expect(
      await statusOf(
        parseRegisterOccurrenceRequest(jsonRequest({ ...body, signatureObjectId: 'x' })),
      ),
    ).toBe(400)
  })
})

describe('o caso de uso confere a assinatura e a grava na coluna própria (spec 246 T2.4, RF9)', () => {
  function register(input: { readonly confirmed: boolean }) {
    const state = createFieldReportState({
      documents: new Map([
        [
          DOCUMENT,
          {
            separationStatus: 'pending',
            stopId: null,
            tripId: '',
            tripStatus: 'on_delivery_route',
          },
        ],
      ]),
    })
    const base = createFieldReportUnitOfWork(state)
    const saved: {
      readonly signatureObjectId?: string | null
      readonly attachmentObjectId: string | null
    }[] = []
    const lookups: {
      readonly companyId: string
      readonly driverId?: string
      readonly id: string
      readonly tripId: string
    }[] = []
    const result = registerDriverOccurrence({
      actorUserId: '00000000-0000-4000-8000-00000000000f',
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: crypto.randomUUID(),
      note: 'cliente recusou',
      occurrenceTypeId: TYPE_ID,
      productCode: '',
      repository: {
        findConfirmedUpload: async (query) => {
          lookups.push(query)
          return input.confirmed ? { id: query.id } : null
        },
        findOccurrenceType: async () => ({
          active: true,
          allowsMultipleItems: true,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: TYPE_ID,
          name: 'Recusa total',
          notifies: false,
          signatureMode: 'required',
          stage: 'delivery',
        }),
        findOccurrenceTypeOverrides: async () => ({
          contractorOverrides: [],
          recipientOverrides: [],
        }),
        findReachableDocument: async () => ({ tripId: TRIP }),
        listDocumentProducts: async () => [],
      },
      signatureObjectId: SIGNATURE,
      unitOfWork: {
        execute: (operation) =>
          base.execute((transaction) =>
            operation({
              ...transaction,
              saveDocumentOccurrence: async (saveInput) => {
                saved.push(saveInput)
                return transaction.saveDocumentOccurrence(saveInput)
              },
            }),
          ),
      },
    })
    return { lookups, result, saved, state }
  }

  test('assinatura confirmada, da viagem e do motorista: grava, sem virar anexo de foto', async () => {
    const { lookups, result, saved } = register({ confirmed: true })

    await result

    expect(lookups).toEqual([{ companyId: COMPANY, driverId: DRIVER, id: SIGNATURE, tripId: TRIP }])
    expect(saved).toHaveLength(1)
    expect(saved[0]?.signatureObjectId).toBe(SIGNATURE)
    expect(saved[0]?.attachmentObjectId).toBeNull()
  })

  test('assinatura que não é desta empresa/viagem/motorista: inalcançável, nada gravado', async () => {
    const { result, state } = register({ confirmed: false })

    expect(await result.catch((error: unknown) => error)).toBeInstanceOf(
      TripOccurrenceUploadNotReachableError,
    )
    expect(state.documentOccurrences.size).toBe(0)
  })
})
