/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { buildDocumentOccurrenceReport } from '../../src/modules/driver-trip/shared/documentOccurrenceReport.service'
import type {
  DriverNfeProduct,
  DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  dispatchOccurrenceRegistration,
  type OccurrenceRegistrationHandlers,
} from '../../src/modules/driver-trip/shared/occurrenceDispatch.service'
import { evaluateOccurrenceValues } from '../../src/modules/driver-trip/shared/occurrenceDraftValues.service'
import { resolveOccurrenceRequirements } from '../../src/modules/driver-trip/shared/occurrenceRequirements.service'

/**
 * Spec 247 (T5.3, CA06, CA07): o que o motorista marcou e digitou sai **pela fila existente**, no corpo
 * que a rota aceita — strings, só `items`/`referenceNumber`/`declaredAmount` — e o formulário incompleto
 * não entra na fila. Nada aqui espera rede: a decisão é dos modos do snapshot.
 */
const CAKE: DriverNfeProduct = {
  code: 'P2',
  description: 'Bolo',
  hasVaryingUnitValue: false,
  quantity: '1.0000',
  unit: 'UN',
  unitValue: '57.2000',
}

const TYPE: DriverOccurrenceType = {
  attachmentMode: 'off',
  declaredAmountMode: 'required',
  declaredAmountScope: 'item',
  flow: 'document',
  id: 'type-1',
  itemsMinimumCount: 1,
  itemsMode: 'required',
  name: 'Devolução parcial',
  noteMode: 'optional',
  photoMode: 'off',
  referenceNumberMode: 'required',
  signatureMode: 'off',
}

type Enqueued = Parameters<OccurrenceRegistrationHandlers['enqueueDocumentOccurrence']>[0]

function dispatch(input: {
  readonly declaredAmountText: string
  readonly referenceNumberText: string
}): { readonly enqueued: Enqueued[]; readonly route: string } {
  const enqueued: Enqueued[] = []
  const values = evaluateOccurrenceValues({
    drafts: {
      P2: { declaredAmountText: input.declaredAmountText, isSelected: true, quantityText: '1' },
    },
    products: [CAKE],
    requirements: resolveOccurrenceRequirements(TYPE),
    texts: { declaredAmount: '', referenceNumber: input.referenceNumberText },
  })
  const route = dispatchOccurrenceRegistration({
    documentId: 'document-1',
    draft: { description: '', photo: undefined, values },
    handlers: {
      enqueueDocumentOccurrence: (occurrence) => enqueued.push(occurrence),
      reportStopOccurrence: () => undefined,
    },
    stopId: 'stop-1',
    type: TYPE,
  })
  return { enqueued, route }
}

describe('o registro entra na fila só com o exigido, e leva o que foi digitado', () => {
  it('falta o número do documento: nada entra na fila', () => {
    const result = dispatch({ declaredAmountText: '50,00', referenceNumberText: '' })

    expect(result.route).toBe('blocked')
    expect(result.enqueued).toEqual([])
  })

  it('falta o valor pago da linha: nada entra na fila', () => {
    const result = dispatch({ declaredAmountText: '', referenceNumberText: 'NFD 45029' })

    expect(result.route).toBe('blocked')
    expect(result.enqueued).toEqual([])
  })

  it('completo: o item da fila leva itens, número e valor pago, tudo em texto', () => {
    const result = dispatch({ declaredAmountText: '50,00', referenceNumberText: ' NFD 45029 ' })

    expect(result.route).toBe('document-queued')
    expect(result.enqueued[0]).toMatchObject({
      documentId: 'document-1',
      items: [{ declaredAmount: '50.00', productCode: 'P2', quantity: '1' }],
      referenceNumber: 'NFD 45029',
    })
    expect(result.enqueued[0]?.declaredAmount).toBeUndefined()
  })

  it('o relato da fila guarda os valores; sem eles o relato é o de antes', () => {
    const withValues = buildDocumentOccurrenceReport({
      idempotencyKey: 'chave',
      occurrence: {
        declaredAmount: '0',
        documentId: 'document-1',
        items: [{ productCode: 'P2', quantity: '1' }],
        note: '',
        occurrenceTypeId: 'type-1',
        occurrenceTypeName: 'Devolução parcial',
        photo: null,
        referenceNumber: 'NFD 1',
      },
    })
    const without = buildDocumentOccurrenceReport({
      idempotencyKey: 'chave',
      occurrence: {
        documentId: 'document-1',
        note: '',
        occurrenceTypeId: 'type-1',
        occurrenceTypeName: 'Recusa total',
        photo: null,
      },
    })

    expect(withValues).toMatchObject({
      declaredAmount: '0',
      items: [{ productCode: 'P2', quantity: '1' }],
      referenceNumber: 'NFD 1',
    })
    expect(Object.keys(without)).not.toContain('items')
    expect(Object.keys(without)).not.toContain('referenceNumber')
    expect(Object.keys(without)).not.toContain('declaredAmount')
  })
})

describe('o corpo do POST da rota do motorista (contrato do servidor, .strict())', () => {
  async function readBody(overrides: Record<string, unknown>): Promise<Record<string, unknown>> {
    const bodies: unknown[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: async (input) => {
        const request = input as Request
        bodies.push(await request.clone().json())
        return Response.json({ data: { id: 'occurrence-1' } }, { status: 201 })
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    await client.send({
      report: {
        documentId: 'document-1',
        idempotencyKey: 'chave',
        kind: 'documentOccurrence',
        location: null,
        note: '',
        occurrenceTypeId: 'type-1',
        occurrenceTypeName: 'Devolução parcial',
        photo: null,
        productCode: '',
        ...overrides,
      },
      stamp: undefined,
    })
    return bodies[0] as Record<string, unknown>
  }

  it('manda itens com quantidade em texto, o número e o valor pago — sem preço nem unidade', async () => {
    const body = await readBody({
      items: [{ declaredAmount: '50.00', productCode: 'P2', quantity: '1' }],
      referenceNumber: 'NFD 45029',
    })

    expect(body).toEqual({
      items: [{ declaredAmount: '50.00', productCode: 'P2', quantity: '1' }],
      location: null,
      note: '',
      occurrenceTypeId: 'type-1',
      productCode: '',
      referenceNumber: 'NFD 45029',
    })
  })

  it('valor pago da ocorrência: texto "0" sai como string, nunca como número', async () => {
    const body = await readBody({ declaredAmount: '0' })

    expect(body.declaredAmount).toBe('0')
    expect(typeof body.declaredAmount).toBe('string')
    expect(Object.keys(body)).not.toContain('items')
  })

  it('sem os campos novos o corpo é o de antes', async () => {
    const body = await readBody({})

    expect(Object.keys(body).sort()).toEqual(['location', 'note', 'occurrenceTypeId', 'productCode'])
  })
})
