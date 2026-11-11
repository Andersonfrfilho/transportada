/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  isDriverOccurrenceType,
  type DriverFieldReport,
  type DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  dispatchOccurrenceRegistration,
  type OccurrenceRegistrationHandlers,
} from '../../src/modules/driver-trip/shared/occurrenceDispatch.service'
import {
  buildReceivingChargeBody,
  EMPTY_RECEIVING_CHARGE_DRAFT,
  isReceivingChargeType,
  listMissingReceivingCharge,
  listOrderedSlots,
  type ReceivingChargeDraft,
} from '../../src/modules/driver-trip/shared/receivingCharge.service'

/**
 * Spec 317 Etapa 4 (T12–T14): o formulário da cobrança no recebimento. O servidor manda as vagas de foto do tipo
 * (`photoSlots`) e o app só lê — nenhuma `slotKey` fixa no código (RF8). Sem as duas fotos, o valor, quem pagou e o PIX,
 * nada entra na fila; com tudo, vai **um** item com as fotos por vaga.
 */
const SLOTS = [
  {
    label: 'Foto do comprovante de pagamento',
    position: 1,
    required: true,
    slotKey: 'payment_receipt',
  },
  { label: 'Foto da placa de cobrança', position: 0, required: true, slotKey: 'charge_sign' },
] as const

const TYPE: DriverOccurrenceType = {
  attachmentMode: 'off',
  flow: 'stop',
  id: '00000000-0000-4000-8000-0000000000c1',
  name: 'Cobrança no recebimento',
  photoSlots: SLOTS,
  stopKind: 'unexpected_charge',
}

const PHOTO = {
  blob: new Blob([new Uint8Array([0xff, 0xd8, 1, 2])], { type: 'image/jpeg' }),
  fileName: 'a.jpg',
}
const ONE_DOCUMENT = { documentIds: ['d1'], slots: listOrderedSlots(TYPE) }
const TWO_DOCUMENTS = { documentIds: ['d1', 'd2'], slots: listOrderedSlots(TYPE) }

const COMPLETE: ReceivingChargeDraft = {
  ...EMPTY_RECEIVING_CHARGE_DRAFT,
  amountText: '12,50',
  paidBy: 'company',
  slotPhotos: { charge_sign: PHOTO, payment_receipt: PHOTO },
}

describe('as vagas de foto vêm do servidor (spec 317 RF8)', () => {
  it('o tipo com vagas bem formadas vale; vaga torta derruba o tipo, não o app', () => {
    expect(isDriverOccurrenceType(TYPE)).toBe(true)
    expect(isDriverOccurrenceType({ ...TYPE, photoSlots: [{ slotKey: 'x' }] })).toBe(false)
    expect(isDriverOccurrenceType({ ...TYPE, photoSlots: 'x' })).toBe(false)
    const legacy: DriverOccurrenceType = { ...TYPE, photoSlots: [] }
    delete (legacy as { photoSlots?: unknown }).photoSlots
    expect(isDriverOccurrenceType(legacy)).toBe(true)
  })

  it('só o tipo de parada `unexpected_charge` com vagas abre o formulário da cobrança', () => {
    expect(isReceivingChargeType(TYPE)).toBe(true)
    expect(isReceivingChargeType({ ...TYPE, photoSlots: [] })).toBe(false)
    expect(isReceivingChargeType({ ...TYPE, flow: 'document' })).toBe(false)
    expect(isReceivingChargeType({ ...TYPE, stopKind: 'other' })).toBe(false)
    expect(isReceivingChargeType(undefined)).toBe(false)
  })

  it('as vagas saem na ordem do servidor (position)', () => {
    expect(listOrderedSlots(TYPE).map((slot) => slot.slotKey)).toEqual([
      'charge_sign',
      'payment_receipt',
    ])
  })

  it('nenhuma slotKey é fixa no código do app: a exigência é lida, nunca reimplementada', () => {
    const root = join(import.meta.dir, '../../src')
    const sources: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/u.test(entry.name)) sources.push(path)
      }
    }
    walk(root)
    const offenders = sources.filter((path) => {
      const text = readFileSync(path, 'utf8')
      return text.includes('charge_sign') || text.includes('payment_receipt')
    })
    expect(offenders).toEqual([])
  })
})

describe('o que falta para enviar (spec 317 T12, T13)', () => {
  it('sem nada, falta cada foto (com o rótulo da vaga), o valor e quem pagou', () => {
    const missing = listMissingReceivingCharge({
      context: ONE_DOCUMENT,
      draft: EMPTY_RECEIVING_CHARGE_DRAFT,
    })
    expect(missing).toEqual([
      { kind: 'photo', label: 'Foto da placa de cobrança', slotKey: 'charge_sign' },
      { kind: 'photo', label: 'Foto do comprovante de pagamento', slotKey: 'payment_receipt' },
      { kind: 'amount' },
      { kind: 'paidBy' },
    ])
  })

  it('só a placa: a mensagem aponta o comprovante', () => {
    const missing = listMissingReceivingCharge({
      context: ONE_DOCUMENT,
      draft: { ...COMPLETE, slotPhotos: { charge_sign: PHOTO } },
    })
    expect(missing).toEqual([
      { kind: 'photo', label: 'Foto do comprovante de pagamento', slotKey: 'payment_receipt' },
    ])
  })

  it('valor 0,00 é valor; vazio não é', () => {
    const zero = listMissingReceivingCharge({
      context: ONE_DOCUMENT,
      draft: { ...COMPLETE, amountText: '0,00' },
    })
    expect(zero).toEqual([])
    const empty = listMissingReceivingCharge({
      context: ONE_DOCUMENT,
      draft: { ...COMPLETE, amountText: '' },
    })
    expect(empty).toEqual([{ kind: 'amount' }])
  })

  it('o motorista pagou: pede o tipo e a chave PIX; a empresa pagou: não pede', () => {
    const driver = { ...COMPLETE, paidBy: 'driver' } as const
    expect(listMissingReceivingCharge({ context: ONE_DOCUMENT, draft: driver })).toEqual([
      { kind: 'pix' },
    ])
    expect(
      listMissingReceivingCharge({
        context: ONE_DOCUMENT,
        draft: { ...driver, pixKey: ' 123.456.789-09 ', pixKeyType: 'cpf' },
      }),
    ).toEqual([])
  })

  it('várias notas: exige marcar as notas e, por nota, o valor de cada uma', () => {
    expect(listMissingReceivingCharge({ context: TWO_DOCUMENTS, draft: COMPLETE })).toEqual([
      { kind: 'documents' },
    ])
    const perDocument = {
      ...COMPLETE,
      selectedDocumentIds: ['d1', 'd2'],
      documentAmountTexts: { d1: '5,00' },
    }
    expect(listMissingReceivingCharge({ context: TWO_DOCUMENTS, draft: perDocument })).toEqual([
      { documentId: 'd2', kind: 'documentAmount' },
    ])
  })
})

describe('o corpo da cobrança (spec 317 E3, E4, E11)', () => {
  it('uma nota: o servidor a assume e o valor vai como texto', () => {
    expect(buildReceivingChargeBody({ context: ONE_DOCUMENT, draft: COMPLETE })).toEqual({
      amount: '12.50',
      mode: 'one_per_document',
      paidBy: 'company',
    })
  })

  it('o motorista pagou: leva o PIX com a chave aparada', () => {
    expect(
      buildReceivingChargeBody({
        context: ONE_DOCUMENT,
        draft: { ...COMPLETE, paidBy: 'driver', pixKey: ' a@b.com ', pixKeyType: 'email' },
      }),
    ).toEqual({
      amount: '12.50',
      driverPix: { key: 'a@b.com', type: 'email' },
      mode: 'one_per_document',
      paidBy: 'driver',
    })
  })

  it('por nota: uma linha por nota marcada, cada uma com o valor dela', () => {
    expect(
      buildReceivingChargeBody({
        context: TWO_DOCUMENTS,
        draft: {
          ...COMPLETE,
          documentAmountTexts: { d1: '5,00', d2: '1.000,05' },
          selectedDocumentIds: ['d2', 'd1'],
        },
      }),
    ).toEqual({
      documents: [
        { amount: '5.00', documentId: 'd1' },
        { amount: '1000.05', documentId: 'd2' },
      ],
      mode: 'one_per_document',
      paidBy: 'company',
    })
  })

  it('agrupada: as notas marcadas sem valor e um valor só', () => {
    expect(
      buildReceivingChargeBody({
        context: TWO_DOCUMENTS,
        draft: { ...COMPLETE, mode: 'grouped', selectedDocumentIds: ['d1', 'd2'] },
      }),
    ).toEqual({
      amount: '12.50',
      documents: [{ documentId: 'd1' }, { documentId: 'd2' }],
      mode: 'grouped',
      paidBy: 'company',
    })
  })

  it('rascunho incompleto não vira corpo', () => {
    expect(
      buildReceivingChargeBody({
        context: ONE_DOCUMENT,
        draft: { ...COMPLETE, paidBy: undefined },
      }),
    ).toBeUndefined()
  })
})

function buildHandlers(calls: unknown[]): OccurrenceRegistrationHandlers {
  return {
    enqueueDocumentOccurrence: () => calls.push('document'),
    reportReceivingCharge: (input) => calls.push(input),
    reportStopOccurrence: () => calls.push('stop'),
  }
}

describe('o registro entra na fila só completo (spec 317 T12)', () => {
  it('sem uma das fotos nada entra na fila', () => {
    const calls: unknown[] = []
    const route = dispatchOccurrenceRegistration({
      documentId: 'd1',
      draft: {
        description: '',
        photo: undefined,
        receivingCharge: {
          documentIds: ['d1'],
          draft: { ...COMPLETE, slotPhotos: { charge_sign: PHOTO } },
        },
      },
      handlers: buildHandlers(calls),
      stopId: 's1',
      type: TYPE,
    })
    expect(route).toBe('blocked')
    expect(calls).toEqual([])
  })

  it('completo: um item só, com as duas fotos na ordem das vagas e o corpo da cobrança', () => {
    const calls: unknown[] = []
    const route = dispatchOccurrenceRegistration({
      documentId: 'd1',
      draft: {
        description: 'Pedágio da doca',
        photo: undefined,
        receivingCharge: { documentIds: ['d1'], draft: COMPLETE },
      },
      handlers: buildHandlers(calls),
      stopId: 's1',
      type: TYPE,
    })
    expect(route).toBe('stop')
    expect(calls).toEqual([
      {
        description: 'Pedágio da doca',
        occurrenceTypeId: TYPE.id,
        photos: [
          { photo: PHOTO, slotKey: 'charge_sign' },
          { photo: PHOTO, slotKey: 'payment_receipt' },
        ],
        receivingCharge: { amount: '12.50', mode: 'one_per_document', paidBy: 'company' },
        stopId: 's1',
      },
    ])
  })
})

describe('a fila sobe as fotos e faz um POST só (spec 317 RF4)', () => {
  it('uma subida por vaga, e o POST leva photos[slotKey, objectId] e receivingCharge com a chave do registro', async () => {
    const API = 'https://api.test'
    const seen: {
      body: Record<string, unknown> | undefined
      key: string | null
      method: string
      path: string
    }[] = []
    let upload = 0
    const client = createDriverTripClient({
      apiUrl: API,
      fetch: async (input) => {
        const request = input as Request
        const url = new URL(request.url)
        const text =
          request.method === 'PUT' || url.origin !== API ? '' : await request.clone().text()
        seen.push({
          body: text.startsWith('{') ? (JSON.parse(text) as Record<string, unknown>) : undefined,
          key: request.headers.get('Idempotency-Key'),
          method: request.method,
          path: url.pathname,
        })
        if (url.origin !== API) return new Response(null, { status: 200 })
        if (url.pathname.endsWith('/occurrence-uploads')) {
          upload += 1
          return Response.json({
            data: { id: `up-${String(upload)}`, uploadUrl: 'https://storage.test/o?sig=1' },
          })
        }
        if (url.pathname.endsWith('/confirm')) {
          return Response.json({
            data: { id: `00000000-0000-4000-8000-00000000000${String(upload)}` },
          })
        }
        return Response.json({ data: { id: 'occ-1' } }, { status: 201 })
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    const report: DriverFieldReport = {
      description: '',
      idempotencyKey: 'chave-do-registro',
      kind: 'stopOccurrenceCharge',
      location: null,
      occurrenceTypeId: TYPE.id,
      photos: [
        { photo: PHOTO, slotKey: 'charge_sign' },
        { photo: PHOTO, slotKey: 'payment_receipt' },
      ],
      receivingCharge: { amount: '12.50', mode: 'one_per_document', paidBy: 'company' },
      stopId: 's1',
    }

    await client.send({ report, stamp: undefined })

    const posts = seen.filter(
      (entry) => entry.method === 'POST' && entry.path.endsWith('/stops/s1/occurrences'),
    )
    expect(posts).toHaveLength(1)
    expect(posts[0]?.key).toBe('chave-do-registro')
    expect(posts[0]?.body?.photos).toEqual([
      { objectId: '00000000-0000-4000-8000-000000000001', slotKey: 'charge_sign' },
      { objectId: '00000000-0000-4000-8000-000000000002', slotKey: 'payment_receipt' },
    ])
    expect(posts[0]?.body?.receivingCharge).toEqual(
      report.kind === 'stopOccurrenceCharge' ? report.receivingCharge : undefined,
    )
    expect(posts[0]?.body?.occurrenceTypeId).toBe(TYPE.id)
    expect(seen.filter((entry) => entry.path.endsWith('/occurrence-uploads'))).toHaveLength(2)
  })
})
