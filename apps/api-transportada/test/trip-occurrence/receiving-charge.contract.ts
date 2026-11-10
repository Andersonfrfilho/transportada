/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 Etapa 2 (T3): a cobrança no recebimento vai para os acertos. Contratos escritos antes do código:
 *
 * - foto faltando por vaga (CA1), vaga desconhecida/repetida;
 * - valor (E3: `0` é valor; dinheiro exato, nunca `number`);
 * - nota: uma assume, várias exigem, nenhuma recusa (E4, E8, CA1);
 * - por nota × agrupada (E4), partes lidas da nota (E5);
 * - reenvio idempotente: uma linha e as fotos uma vez (E6, CA3);
 * - quem pagou e o PIX (E11);
 * - cliente marcado (E7, CA5);
 * - nada à contratante (D1, RF7, CA4) e sem a sugestão de 0 (E10).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import type { ReportStopOccurrenceInput } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import {
  resolveReceivingCharge,
  type ReceivingChargeStopDocument,
} from '../../src/trips/domain/receiving-charge.policy.js'
import {
  resolveLegacyAttachmentObjectId,
  resolveStopOccurrencePhotos,
  type StopOccurrencePhotoSlot,
} from '../../src/trips/domain/stop-occurrence-photo-slots.policy.js'
import type {
  OccurrenceResolutionTransactionPort,
  RecordDriverPayoutReceiptOutcome,
} from '../../src/trips/application/occurrence-resolution.port.js'
import { createResolveOccurrenceUseCase } from '../../src/trips/application/resolve-occurrence.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  saveOccurrenceTypeWithTemplate,
  type CurrentOccurrenceTypeShape,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { parseStopOccurrenceRequest } from '../../src/trips/presentation/me-trip.schema.js'
import { parseOfficeStopOccurrenceRequest } from '../../src/trips/presentation/trip-field-office.schema.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENT_A = '00000000-0000-4000-8000-0000000000a1'
const DOCUMENT_B = '00000000-0000-4000-8000-0000000000a2'
const DOCUMENT_OTHER_STOP = '00000000-0000-4000-8000-0000000000a9'
const CLIENT_ID = '00000000-0000-4000-8000-0000000000b1'
const OTHER_CLIENT_ID = '00000000-0000-4000-8000-0000000000b2'
const CONTRACTOR_ID = '00000000-0000-4000-8000-0000000000c1'
const CHARGE_TYPE_ID = '00000000-0000-4000-8000-0000000000d1'
const LONG_WAIT_TYPE_ID = '00000000-0000-4000-8000-0000000000d2'
const SIGN_PHOTO = '00000000-0000-4000-8000-0000000000f1'
const RECEIPT_PHOTO = '00000000-0000-4000-8000-0000000000f2'

const SLOTS: readonly StopOccurrencePhotoSlot[] = [
  {
    label: 'Foto do comprovante de pagamento',
    position: 1,
    required: true,
    slotKey: 'payment_receipt',
  },
  { label: 'Foto da placa de cobrança', position: 0, required: true, slotKey: 'charge_sign' },
]

const BOTH_PHOTOS = [
  { objectId: SIGN_PHOTO, slotKey: 'charge_sign' },
  { objectId: RECEIPT_PHOTO, slotKey: 'payment_receipt' },
] as const

function stopDocument(
  documentId: string,
  overrides: Partial<ReceivingChargeStopDocument> = {},
): ReceivingChargeStopDocument {
  return {
    contractorId: CONTRACTOR_ID,
    deliveryClientId: CLIENT_ID,
    documentId,
    tripId: TRIP_ID,
    ...overrides,
  }
}

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as { readonly code?: string }).code ?? 'NO_CODE'
  }
  return 'OK'
}

async function asyncCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    return (error as { readonly code?: string }).code ?? 'NO_CODE'
  }
  return 'OK'
}

describe('as vagas de foto do tipo (spec 317 E1, RF3)', () => {
  test('as duas fotos saem na ordem das vagas, com a posição da vaga', () => {
    const photos = resolveStopOccurrencePhotos({
      isOffice: false,
      photos: [...BOTH_PHOTOS].reverse(),
      slots: SLOTS,
    })

    expect(photos).toEqual([
      { objectId: SIGN_PHOTO, position: 0, slotKey: 'charge_sign' },
      { objectId: RECEIPT_PHOTO, position: 1, slotKey: 'payment_receipt' },
    ])
    expect(resolveLegacyAttachmentObjectId({ attachmentObjectId: null, photos })).toBe(SIGN_PHOTO)
  })

  test('falta uma vaga obrigatória: 422 com a vaga que falta (CA1)', () => {
    let caught: unknown
    try {
      resolveStopOccurrencePhotos({ isOffice: false, photos: [BOTH_PHOTOS[0]], slots: SLOTS })
    } catch (error) {
      caught = error
    }
    const error = caught as { code: string; extraBody: { slotKey: string }; status: number }
    expect(error.code).toBe('STOP_OCCURRENCE_PHOTO_SLOT_MISSING')
    expect(error.status).toBe(422)
    expect(error.extraBody.slotKey).toBe('payment_receipt')
  })

  test('vaga desconhecida, vaga repetida e o mesmo upload em duas vagas são 400', () => {
    const run = (photos: readonly { objectId: string; slotKey: string }[]) =>
      codeOf(() => resolveStopOccurrencePhotos({ isOffice: false, photos, slots: SLOTS }))

    expect(run([...BOTH_PHOTOS, { objectId: CLIENT_ID, slotKey: 'selfie' }])).toBe(
      'STOP_OCCURRENCE_PHOTO_SLOT_INVALID',
    )
    expect(run([BOTH_PHOTOS[0], { objectId: RECEIPT_PHOTO, slotKey: 'charge_sign' }])).toBe(
      'STOP_OCCURRENCE_PHOTO_SLOT_INVALID',
    )
    expect(run([BOTH_PHOTOS[0], { objectId: SIGN_PHOTO, slotKey: 'payment_receipt' }])).toBe(
      'STOP_OCCURRENCE_PHOTO_SLOT_INVALID',
    )
  })

  test('tipo sem vagas não aceita fotos por vaga', () => {
    expect(
      codeOf(() =>
        resolveStopOccurrencePhotos({ isOffice: false, photos: [BOTH_PHOTOS[0]], slots: [] }),
      ),
    ).toBe('STOP_OCCURRENCE_PHOTO_SLOT_INVALID')
  })

  test('o escritório não tem o anexo da parada: as vagas não se cobram dele (spec 209/315)', () => {
    expect(resolveStopOccurrencePhotos({ isOffice: true, photos: [], slots: SLOTS })).toEqual([])
  })
})

describe('a nota, o valor e as partes da cobrança (spec 317 E3, E4, E5, E8)', () => {
  const resolve = (params: Partial<Parameters<typeof resolveReceivingCharge>[0]>) =>
    resolveReceivingCharge({
      fallbackDocumentId: null,
      input: { amount: '12.50', paidBy: 'company' },
      stopDocuments: [stopDocument(DOCUMENT_A)],
      ...params,
    })

  test('parada com uma nota assume essa nota sem perguntar', () => {
    const charge = resolve({})

    expect(charge.lines).toEqual([
      {
        amount: '12.5000',
        contractorId: CONTRACTOR_ID,
        deliveryClientId: CLIENT_ID,
        documentIds: [DOCUMENT_A],
        grouped: false,
        tripDocumentId: DOCUMENT_A,
        tripId: TRIP_ID,
      },
    ])
    expect(charge.declaredAmount).toBe('12.5000')
  })

  test('parada com várias notas exige a nota; parada sem nota recusa (E8, CA1)', () => {
    expect(
      codeOf(() =>
        resolve({ stopDocuments: [stopDocument(DOCUMENT_A), stopDocument(DOCUMENT_B)] }),
      ),
    ).toBe('STOP_OCCURRENCE_DOCUMENT_REQUIRED')
    expect(codeOf(() => resolve({ stopDocuments: [] }))).toBe('STOP_OCCURRENCE_DOCUMENT_REQUIRED')
  })

  test('a nota de topo da ocorrência vale como a nota da cobrança', () => {
    const charge = resolve({
      fallbackDocumentId: DOCUMENT_B,
      stopDocuments: [stopDocument(DOCUMENT_A), stopDocument(DOCUMENT_B)],
    })
    expect(charge.lines.map((line) => line.tripDocumentId)).toEqual([DOCUMENT_B])
  })

  test('por nota: uma linha por nota, cada uma com o valor dela, e o total exato (sem float)', () => {
    const charge = resolve({
      input: {
        documents: [
          { amount: '0.10', documentId: DOCUMENT_A },
          { amount: '0.20', documentId: DOCUMENT_B },
        ],
        mode: 'one_per_document',
        paidBy: 'company',
      },
      stopDocuments: [
        stopDocument(DOCUMENT_A),
        stopDocument(DOCUMENT_B, { deliveryClientId: OTHER_CLIENT_ID }),
      ],
    })

    expect(
      charge.lines.map((line) => [line.tripDocumentId, line.amount, line.deliveryClientId]),
    ).toEqual([
      [DOCUMENT_A, '0.1000', CLIENT_ID],
      [DOCUMENT_B, '0.2000', OTHER_CLIENT_ID],
    ])
    expect(charge.declaredAmount).toBe('0.3000')
  })

  test('por nota com várias notas: nota sem valor é recusada', () => {
    expect(
      codeOf(() =>
        resolve({
          input: {
            documents: [{ amount: '1.00', documentId: DOCUMENT_A }, { documentId: DOCUMENT_B }],
            paidBy: 'company',
          },
          stopDocuments: [stopDocument(DOCUMENT_A), stopDocument(DOCUMENT_B)],
        }),
      ),
    ).toBe('TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')
  })

  test('agrupada: uma linha só, sem nota própria, com as notas listadas e um valor', () => {
    const charge = resolve({
      input: {
        amount: '80.00',
        documents: [{ documentId: DOCUMENT_A }, { documentId: DOCUMENT_B }],
        mode: 'grouped',
        paidBy: 'company',
      },
      stopDocuments: [stopDocument(DOCUMENT_A), stopDocument(DOCUMENT_B)],
    })

    expect(charge.lines).toHaveLength(1)
    expect(charge.lines[0]).toMatchObject({
      amount: '80.0000',
      documentIds: [DOCUMENT_A, DOCUMENT_B],
      grouped: true,
      tripDocumentId: null,
    })
    expect(charge.declaredAmount).toBe('80.0000')
  })

  test('agrupada com clientes ou contratantes diferentes é recusada', () => {
    expect(
      codeOf(() =>
        resolve({
          input: {
            amount: '80.00',
            documents: [{ documentId: DOCUMENT_A }, { documentId: DOCUMENT_B }],
            mode: 'grouped',
            paidBy: 'company',
          },
          stopDocuments: [
            stopDocument(DOCUMENT_A),
            stopDocument(DOCUMENT_B, { contractorId: null }),
          ],
        }),
      ),
    ).toBe('STOP_OCCURRENCE_CHARGE_GROUP_MIXED_PARTIES')
  })

  test('sem valor é recusado; `0` é valor (spec 247)', () => {
    expect(codeOf(() => resolve({ input: { paidBy: 'company' } }))).toBe(
      'TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED',
    )
    expect(resolve({ input: { amount: '0', paidBy: 'company' } }).declaredAmount).toBe('0.0000')
  })

  test('nota de outra parada, nota repetida e destinatário sem cadastro são recusados', () => {
    expect(
      codeOf(() =>
        resolve({
          input: {
            amount: '1',
            documents: [{ documentId: DOCUMENT_OTHER_STOP }],
            paidBy: 'company',
          },
        }),
      ),
    ).toBe('STOP_OCCURRENCE_DOCUMENT_NOT_IN_STOP')
    expect(
      codeOf(() =>
        resolve({
          input: {
            documents: [
              { amount: '1', documentId: DOCUMENT_A },
              { amount: '1', documentId: DOCUMENT_A },
            ],
            paidBy: 'company',
          },
        }),
      ),
    ).toBe('STOP_OCCURRENCE_DOCUMENT_NOT_IN_STOP')
    expect(
      codeOf(() =>
        resolve({ stopDocuments: [stopDocument(DOCUMENT_A, { deliveryClientId: null })] }),
      ),
    ).toBe('DELIVERY_CLIENT_NOT_RESOLVED')
  })
})

describe('quem pagou e o PIX (spec 317 E11)', () => {
  const resolve = (input: Parameters<typeof resolveReceivingCharge>[0]['input']) =>
    resolveReceivingCharge({
      fallbackDocumentId: null,
      input,
      stopDocuments: [stopDocument(DOCUMENT_A)],
    })

  test('"Quem pagou?" é obrigatório', () => {
    expect(codeOf(() => resolve({ amount: '5' }))).toBe('STOP_OCCURRENCE_PAID_BY_REQUIRED')
  })

  test('o motorista pagou: o PIX é obrigatório e gravado', () => {
    expect(codeOf(() => resolve({ amount: '5', paidBy: 'driver' }))).toBe(
      'STOP_OCCURRENCE_DRIVER_PIX_REQUIRED',
    )
    const charge = resolve({
      amount: '5',
      driverPix: { key: ' motorista@exemplo.com ', type: 'email' },
      paidBy: 'driver',
    })
    expect([charge.paidBy, charge.driverPixKey, charge.driverPixKeyType]).toEqual([
      'driver',
      'motorista@exemplo.com',
      'email',
    ])
  })

  test('a empresa pagou: nada de PIX', () => {
    const charge = resolve({ amount: '5', paidBy: 'company' })
    expect([charge.driverPixKey, charge.driverPixKeyType]).toEqual([null, null])
  })
})

describe('o corpo do registro (spec 317, aditivo e `.strict()`)', () => {
  const request = (body: unknown) =>
    new Request('http://localhost/x', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

  test('fotos por vaga e a cobrança entram no corpo do motorista', async () => {
    const parsed = await parseStopOccurrenceRequest(
      request({
        occurrenceTypeId: CHARGE_TYPE_ID,
        photos: BOTH_PHOTOS,
        receivingCharge: {
          documents: [{ amount: '10.00', documentId: DOCUMENT_A }],
          driverPix: { key: '11999999999', type: 'phone' },
          mode: 'one_per_document',
          paidBy: 'driver',
        },
      }),
    )

    expect(parsed.photos).toEqual(BOTH_PHOTOS)
    expect(parsed.receivingCharge?.documents).toEqual([{ amount: '10.00', documentId: DOCUMENT_A }])
  })

  test('valor como número, três casas, campo de preço e PIX com a empresa pagando são 400', async () => {
    const bodies = [
      { receivingCharge: { amount: 10, paidBy: 'company' } },
      { receivingCharge: { amount: '10.005', paidBy: 'company' } },
      { receivingCharge: { amount: '10', paidBy: 'company', unitValue: '1' } },
      {
        receivingCharge: {
          amount: '10',
          driverPix: { key: 'x', type: 'email' },
          paidBy: 'company',
        },
      },
      {
        receivingCharge: {
          amount: '10',
          documents: [{ amount: '5', documentId: DOCUMENT_A }],
          mode: 'grouped',
          paidBy: 'company',
        },
      },
      { photos: [{ objectId: SIGN_PHOTO, slotKey: 'Placa' }] },
    ]
    for (const body of bodies) {
      await expect(
        parseStopOccurrenceRequest(request({ occurrenceTypeId: CHARGE_TYPE_ID, ...body })),
      ).rejects.toThrow()
    }
  })

  test('o escritório manda a cobrança, mas não foto por vaga', async () => {
    const parsed = await parseOfficeStopOccurrenceRequest(
      request({
        occurrenceTypeId: CHARGE_TYPE_ID,
        receivingCharge: { amount: '3', paidBy: 'company' },
      }),
    )
    expect(parsed.receivingCharge).toEqual({ amount: '3', paidBy: 'company' })
    await expect(
      parseOfficeStopOccurrenceRequest(
        request({ occurrenceTypeId: CHARGE_TYPE_ID, photos: BOTH_PHOTOS }),
      ),
    ).rejects.toThrow()
  })
})

describe('o registro da cobrança no recebimento (spec 317 T5, CA2, CA3, CA5)', () => {
  function buildWorld(
    stopDocuments: readonly ReceivingChargeStopDocument[] = [stopDocument(DOCUMENT_A)],
  ) {
    const state = createFieldReportState()
    state.stops.set(STOP_ID, {
      arrivedAt: null,
      estimatedArrivalAt: null,
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
    })
    state.documents.set(DOCUMENT_A, {
      separationStatus: 'loaded',
      stopId: STOP_ID,
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
    })
    state.stopOccurrenceTypes.set(`${COMPANY_ID}:${CHARGE_TYPE_ID}`, {
      photoSlots: SLOTS,
      stopKind: 'unexpected_charge',
    })
    state.stopOccurrenceTypes.set(`${COMPANY_ID}:${LONG_WAIT_TYPE_ID}`, {
      photoSlots: [],
      stopKind: 'long_wait',
    })
    state.stopChargeDocuments.set(STOP_ID, stopDocuments)
    return createFieldReportUnitOfWork(state)
  }

  function input(
    world: ReturnType<typeof buildWorld>,
    overrides: Partial<ReportStopOccurrenceInput> = {},
  ): ReportStopOccurrenceInput {
    return {
      actorUserId: ACTOR_USER_ID,
      attachmentObjectId: null,
      attachmentUploads: {
        attachUploadToStopOccurrence: async () => {},
        findConfirmedUpload: async (query) => ({ id: query.id }),
      },
      companyId: COMPANY_ID,
      description: 'Cobraram para receber',
      distanceMeters: null,
      documentId: null,
      driverId: DRIVER_ID,
      idempotencyKey: 'chave-cobranca',
      location: null,
      occurrenceTypeId: CHARGE_TYPE_ID,
      photos: BOTH_PHOTOS,
      receivingCharge: {
        amount: '45.90',
        driverPix: { key: '12345678909', type: 'cpf' },
        paidBy: 'driver',
      },
      stopId: STOP_ID,
      unitOfWork: world,
      ...overrides,
    } as ReportStopOccurrenceInput
  }

  test('registro válido: uma linha recorded com nota, cliente, valor, fotos e o cliente marcado (CA2, CA5)', async () => {
    const world = buildWorld()
    const result = await reportStopOccurrence(input(world))

    const lines = [...world.state.receivingChargeLines.values()]
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      amount: '45.9000',
      contractorId: CONTRACTOR_ID,
      deliveryClientId: CLIENT_ID,
      proofObjectId: RECEIPT_PHOTO,
      stopOccurrenceId: result.id,
      tripDocumentId: DOCUMENT_A,
      tripId: TRIP_ID,
    })
    expect(world.state.stopOccurrencePhotos.get(`${result.id}:charge_sign`)).toBe(SIGN_PHOTO)
    expect(world.state.stopOccurrencePhotos.get(`${result.id}:payment_receipt`)).toBe(RECEIPT_PHOTO)
    expect(world.state.recordedReceivingCharges).toEqual([
      {
        declaredAmount: '45.9000',
        driverPixKey: '12345678909',
        driverPixKeyType: 'cpf',
        paidBy: 'driver',
      },
    ])
    /** E2: a coluna antiga guarda a placa; a ocorrência ganha a nota que a cobrança cobre. */
    expect(world.state.recordedOccurrenceColumns).toEqual([
      { attachmentObjectId: SIGN_PHOTO, documentId: DOCUMENT_A },
    ])
    expect(world.state.flaggedClients.get(CLIENT_ID)?.sourceStopOccurrenceId).toBe(result.id)
  })

  test('reenvio da fila com a mesma chave não duplica linha, foto nem marca (E6, CA3)', async () => {
    const world = buildWorld()
    const first = await reportStopOccurrence(input(world))
    const second = await reportStopOccurrence(input(world))

    expect(second.id).toBe(first.id)
    expect(
      world.state.calls.filter((call) => call.startsWith('recordReceivingCharges')),
    ).toHaveLength(1)
    expect(world.state.receivingChargeLines.size).toBe(1)
    expect(world.state.stopOccurrencePhotos.size).toBe(2)
    expect(world.state.flaggedClients.get(CLIENT_ID)?.updates).toBe(1)
  })

  test('cliente já marcado por outra cobrança: só atualiza a data, a origem fica (E7)', async () => {
    const world = buildWorld()
    const first = await reportStopOccurrence(input(world))
    await reportStopOccurrence(input(world, { idempotencyKey: 'outra-chave' }))

    expect(world.state.flaggedClients.get(CLIENT_ID)).toEqual({
      sourceStopOccurrenceId: first.id,
      updates: 2,
    })
  })

  test('sem uma das fotos, sem valor ou sem nota (várias): recusado, e nada é gravado (CA1)', async () => {
    const missingPhoto = buildWorld()
    expect(
      await asyncCodeOf(reportStopOccurrence(input(missingPhoto, { photos: [BOTH_PHOTOS[0]] }))),
    ).toBe('STOP_OCCURRENCE_PHOTO_SLOT_MISSING')

    const missingAmount = buildWorld()
    expect(
      await asyncCodeOf(
        reportStopOccurrence(input(missingAmount, { receivingCharge: { paidBy: 'company' } })),
      ),
    ).toBe('TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED')

    const twoNotes = buildWorld([stopDocument(DOCUMENT_A), stopDocument(DOCUMENT_B)])
    expect(await asyncCodeOf(reportStopOccurrence(input(twoNotes)))).toBe(
      'STOP_OCCURRENCE_DOCUMENT_REQUIRED',
    )

    for (const world of [missingPhoto, missingAmount, twoNotes]) {
      expect(world.state.calls.some((call) => call.startsWith('recordOccurrence'))).toBe(false)
      expect(world.state.receivingChargeLines.size).toBe(0)
      expect(world.state.flaggedClients.size).toBe(0)
    }
  })

  test('foto de upload que não é deste motorista/viagem é recusada (spec 209 RF2)', async () => {
    const world = buildWorld()
    const code = await asyncCodeOf(
      reportStopOccurrence(
        input(world, {
          attachmentUploads: {
            attachUploadToStopOccurrence: async () => {},
            findConfirmedUpload: async (query) =>
              query.id === RECEIPT_PHOTO ? null : { id: query.id },
          },
        }),
      ),
    )
    expect(code).toBe('TRIP_OCCURRENCE_UPLOAD_NOT_REACHABLE')
  })

  test('agrupada por várias notas: uma linha, notas listadas, total da ocorrência', async () => {
    const world = buildWorld([stopDocument(DOCUMENT_A), stopDocument(DOCUMENT_B)])
    await reportStopOccurrence(
      input(world, {
        receivingCharge: {
          amount: '100.00',
          documents: [{ documentId: DOCUMENT_A }, { documentId: DOCUMENT_B }],
          mode: 'grouped',
          paidBy: 'company',
        },
      }),
    )

    const lines = [...world.state.receivingChargeLines.values()]
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      documentIds: [DOCUMENT_A, DOCUMENT_B],
      grouped: true,
      tripDocumentId: null,
    })
    expect(world.state.recordedReceivingCharges[0]?.declaredAmount).toBe('100.0000')
    /** Duas notas: a ocorrência não escolhe uma por palpite. */
    expect(world.state.recordedOccurrenceColumns[0]?.documentId).toBeNull()
  })

  test('o escritório lança a cobrança sem fotos (não tem o anexo da parada)', async () => {
    const world = buildWorld()
    await reportStopOccurrence({
      actorUserId: ACTOR_USER_ID,
      attachmentObjectId: null,
      companyId: COMPANY_ID,
      description: '',
      distanceMeters: null,
      documentId: null,
      idempotencyKey: 'office-key',
      occurrenceTypeId: CHARGE_TYPE_ID,
      receivingCharge: { amount: '20', paidBy: 'company' },
      stopId: STOP_ID,
      target: { driverId: DRIVER_ID, tripId: TRIP_ID },
      unitOfWork: world,
    } as unknown as ReportStopOccurrenceInput)

    expect(world.state.receivingChargeLines.size).toBe(1)
  })

  test('cobrança mandada em outro tipo é 400, e o tipo sem cobrança não marca nem cria linha', async () => {
    const world = buildWorld()
    expect(
      await asyncCodeOf(
        reportStopOccurrence(
          input(world, { occurrenceTypeId: LONG_WAIT_TYPE_ID, photos: undefined }),
        ),
      ),
    ).toBe('STOP_OCCURRENCE_RECEIVING_CHARGE_NOT_ACCEPTED')

    await reportStopOccurrence(
      input(world, {
        idempotencyKey: 'espera',
        occurrenceTypeId: LONG_WAIT_TYPE_ID,
        photos: undefined,
        receivingCharge: undefined,
      }),
    )
    expect(world.state.receivingChargeLines.size).toBe(0)
    expect(world.state.flaggedClients.size).toBe(0)
  })

  test('o corpo antigo (só o kind) segue sendo só relato: sem linha e sem sugestão de 0 (E10)', async () => {
    const world = buildWorld()
    await reportStopOccurrence(
      input(world, {
        kind: 'unexpected_charge',
        occurrenceTypeId: undefined,
        photos: undefined,
        receivingCharge: undefined,
      } as Partial<ReportStopOccurrenceInput>),
    )

    expect(world.state.calls).toContain('recordOccurrence:unexpected_charge')
    expect(world.state.receivingChargeLines.size).toBe(0)
  })
})

describe('nada sai para a contratante (spec 317 D1, RF7, CA4)', () => {
  const source = readFileSync(
    new URL('../../src/trips/application/report-stop-occurrence.use-case.ts', import.meta.url),
    'utf8',
  )

  test('o registro da parada não conhece e-mail, portal, bot nem a sugestão de 0', () => {
    for (const forbidden of [
      'contractor-mail',
      'occurrence-conversation',
      'send-automatic-occurrence-mail',
      'contractor-portal',
      'whatsapp',
      'suggestCharges',
      'onDelivered',
    ]) {
      expect(source.includes(forbidden)).toBe(false)
    }
  })
})

describe('o tipo da cobrança no recebimento não avisa a contratante (spec 317 T7)', () => {
  function save(
    stored: CurrentOccurrenceTypeShape | null,
    values: Partial<SaveOccurrenceTypeValues>,
  ) {
    const saved: SaveOccurrenceTypeValues[] = []
    const promise = saveOccurrenceTypeWithTemplate({
      companyId: COMPANY_ID,
      findCurrentType: async () => stored,
      save: async (toSave) => {
        saved.push(toSave)
        return { id: CHARGE_TYPE_ID } as unknown as OccurrenceTypeRecord
      },
      templates: {
        findContractorTemplate: async () => null,
        hasActiveEmailTemplate: async () => true,
      },
      values: {
        active: true,
        emailTemplateKey: null,
        name: 'Cobrança no recebimento',
        notifies: false,
        occurrenceTypeId: CHARGE_TYPE_ID,
        stage: 'delivery',
        ...values,
      },
    })
    return { promise, saved }
  }

  const chargeType = {
    itemsMode: 'off',
    redeliveryPolicy: null,
    stopKind: 'unexpected_charge',
  } as unknown as CurrentOccurrenceTypeShape

  test('ligar `emailsContractor` no tipo `unexpected_charge` é 400 e nada é gravado', async () => {
    const { promise, saved } = save(chargeType, { emailsContractor: true })
    expect(await asyncCodeOf(promise)).toBe(
      'OCCURRENCE_TYPE_RECEIVING_CHARGE_CONTRACTOR_MAIL_NOT_ALLOWED',
    )
    expect(saved).toHaveLength(0)
  })

  test('desligar, ou ligar noutro tipo, segue gravando', async () => {
    expect(await asyncCodeOf(save(chargeType, { emailsContractor: false }).promise)).toBe('OK')
    const otherType = {
      ...chargeType,
      stopKind: 'long_wait',
    } as unknown as CurrentOccurrenceTypeShape
    expect(await asyncCodeOf(save(otherType, { emailsContractor: true }).promise)).toBe('OK')
  })
})

describe('o comprovante do PIX ao concluir (spec 317 E13, T5b)', () => {
  const RECEIPT_ATTACHMENT = '00000000-0000-4000-8000-0000000000e1'

  function resolver(outcome: RecordDriverPayoutReceiptOutcome) {
    const calls: string[] = []
    const transaction: OccurrenceResolutionTransactionPort = {
      insertInternalResolution: async () => {
        calls.push('resolved')
        return { createdAt: '2026-11-10T12:00:00.000Z' }
      },
      listLatestEvents: async () => [],
      lockOccurrence: async () => ({ cancelledAt: undefined }),
      recordDriverPayoutReceipt: async (input) => {
        calls.push(`payout:${input.attachmentId}:${input.occurrenceId}:${input.companyId}`)
        return outcome
      },
    }
    const useCase = createResolveOccurrenceUseCase({
      logger: { error() {}, info() {}, warn() {} },
      unitOfWork: { execute: (operation) => operation(transaction) },
    })
    const resolve = (overrides: Record<string, unknown> = {}) =>
      useCase.execute({
        context: { companyId: COMPANY_ID, userId: ACTOR_USER_ID } as never,
        note: 'PIX feito',
        occurrenceId: STOP_ID,
        occurrenceKind: 'stop',
        ...overrides,
      })
    return { calls, resolve }
  }

  test('sem comprovante conclui como sempre: nunca bloqueia', async () => {
    const { calls, resolve } = resolver('not_found')
    expect(await asyncCodeOf(resolve())).toBe('OK')
    expect(calls).toEqual(['resolved'])
  })

  test('com o anexo do chat do motorista desta ocorrência: grava junto da resolução', async () => {
    const { calls, resolve } = resolver('recorded')
    expect(
      await asyncCodeOf(resolve({ driverPayoutReceiptAttachmentId: RECEIPT_ATTACHMENT })),
    ).toBe('OK')
    expect(calls).toEqual([`payout:${RECEIPT_ATTACHMENT}:${STOP_ID}:${COMPANY_ID}`, 'resolved'])
  })

  test('anexo alheio é 404, empresa paga é 422, ocorrência de nota é 422 — e nada se resolve', async () => {
    const alien = resolver('not_found')
    expect(
      await asyncCodeOf(alien.resolve({ driverPayoutReceiptAttachmentId: RECEIPT_ATTACHMENT })),
    ).toBe('STOP_OCCURRENCE_PAYOUT_RECEIPT_NOT_FOUND')
    expect(alien.calls).not.toContain('resolved')

    const companyPaid = resolver('not_driver_paid')
    expect(
      await asyncCodeOf(
        companyPaid.resolve({ driverPayoutReceiptAttachmentId: RECEIPT_ATTACHMENT }),
      ),
    ).toBe('STOP_OCCURRENCE_PAYOUT_NOT_APPLICABLE')
    expect(companyPaid.calls).not.toContain('resolved')

    const documentKind = resolver('recorded')
    expect(
      await asyncCodeOf(
        documentKind.resolve({
          driverPayoutReceiptAttachmentId: RECEIPT_ATTACHMENT,
          occurrenceKind: 'document',
        }),
      ),
    ).toBe('STOP_OCCURRENCE_PAYOUT_NOT_APPLICABLE')
    expect(documentKind.calls).toEqual([])
  })
})
