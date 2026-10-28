/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { buildDocumentOccurrenceReport } from '../../src/modules/driver-trip/shared/documentOccurrenceReport.service'
import type { DriverOccurrenceType } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  dispatchOccurrenceRegistration,
  type OccurrenceRegistrationHandlers,
} from '../../src/modules/driver-trip/shared/occurrenceDispatch.service'
import { evaluateOccurrenceValues } from '../../src/modules/driver-trip/shared/occurrenceDraftValues.service'
import {
  maskDateInput,
  readNewDueDate,
  type NewDueDateProblem,
} from '../../src/modules/driver-trip/shared/occurrenceNewDueDate.service'
import { resolveOccurrenceRequirements } from '../../src/modules/driver-trip/shared/occurrenceRequirements.service'

/**
 * A nova data de vencimento opcional do pedido de prorrogação: campo só de números com máscara, vazio não é problema,
 * data pela metade/inexistente/passada bloqueia o botão (nada é descartado em silêncio), e a data válida sai pela fila
 * como `AAAA-MM-DD`. Tipo que não a pede nunca a manda.
 */
const NOW = new Date(2026, 9, 28, 10, 0, 0)

const TYPE: DriverOccurrenceType = {
  asksNewDueDate: true,
  attachmentMode: 'off',
  flow: 'document',
  id: 'type-1',
  itemsMode: 'off',
  name: 'Cliente pediu prorrogação do boleto',
  noteMode: 'optional',
  photoMode: 'off',
  signatureMode: 'off',
}

type Enqueued = Parameters<OccurrenceRegistrationHandlers['enqueueDocumentOccurrence']>[0]

function dispatch(input: { readonly asks?: boolean; readonly text: string }): {
  readonly enqueued: Enqueued[]
  readonly route: string
} {
  const type = { ...TYPE, asksNewDueDate: input.asks ?? true }
  const enqueued: Enqueued[] = []
  const values = evaluateOccurrenceValues({
    asksNewDueDate: type.asksNewDueDate,
    drafts: {},
    now: NOW,
    products: [],
    requirements: resolveOccurrenceRequirements(type),
    texts: { declaredAmount: '', newDueDate: input.text, referenceNumber: '' },
  })
  const route = dispatchOccurrenceRegistration({
    documentId: 'document-1',
    draft: { description: '', photo: undefined, values },
    handlers: {
      enqueueDocumentOccurrence: (occurrence) => enqueued.push(occurrence),
      reportStopOccurrence: () => undefined,
    },
    stopId: 'stop-1',
    type,
  })
  return { enqueued, route }
}

describe('a máscara da data', () => {
  it.each([
    ['', ''],
    ['2', '2'],
    ['25', '25'],
    ['251', '25/1'],
    ['2511', '25/11'],
    ['25112026', '25/11/2026'],
    ['25/11/2026', '25/11/2026'],
    ['25.11.2026abc', '25/11/2026'],
    ['251120261234', '25/11/2026'],
  ])('%s vira %s', (text, expected) => {
    expect(maskDateInput(text)).toBe(expected)
  })
})

describe('a leitura da data', () => {
  it('vazio não é data nem problema', () => {
    expect(readNewDueDate({ now: NOW, text: '' })).toEqual({ iso: undefined, problem: undefined })
  })

  it('hoje e o futuro valem, em AAAA-MM-DD', () => {
    expect(readNewDueDate({ now: NOW, text: '28/10/2026' }).iso).toBe('2026-10-28')
    expect(readNewDueDate({ now: NOW, text: '25/11/2026' }).iso).toBe('2026-11-25')
  })

  it.each<[string, NewDueDateProblem]>([
    ['25/11', 'incomplete'],
    ['25/11/20', 'incomplete'],
    ['31/02/2027', 'invalid'],
    ['10/13/2027', 'invalid'],
    ['27/10/2026', 'past'],
  ])('%s é problema %s', (text, problem) => {
    expect(readNewDueDate({ now: NOW, text })).toEqual({ iso: undefined, problem })
  })
})

describe('o registro com a data', () => {
  it('sem data o registro entra como sempre', () => {
    const result = dispatch({ text: '' })

    expect(result.route).toBe('document-queued')
    expect(result.enqueued[0]?.newDueDate).toBeUndefined()
  })

  it('data válida entra na fila em AAAA-MM-DD', () => {
    const result = dispatch({ text: '25/11/2026' })

    expect(result.route).toBe('document-queued')
    expect(result.enqueued[0]?.newDueDate).toBe('2026-11-25')
  })

  it.each(['25/11', '31/02/2027', '01/01/2020'])(
    'data %s bloqueia o botão e nada entra na fila',
    (text) => {
      const result = dispatch({ text })

      expect(result.route).toBe('blocked')
      expect(result.enqueued).toEqual([])
    },
  )

  it('tipo que não pede a data ignora o texto', () => {
    const result = dispatch({ asks: false, text: '01/01/2020' })

    expect(result.route).toBe('document-queued')
    expect(result.enqueued[0]?.newDueDate).toBeUndefined()
  })

  it('o relato da fila guarda a data; sem ela o relato é o de antes', () => {
    const base = {
      documentId: 'document-1',
      note: '',
      occurrenceTypeId: 'type-1',
      occurrenceTypeName: 'Prorrogação',
      photo: null,
    }
    const withDate = buildDocumentOccurrenceReport({
      idempotencyKey: 'chave',
      occurrence: { ...base, newDueDate: '2026-11-25' },
    })
    const without = buildDocumentOccurrenceReport({ idempotencyKey: 'chave', occurrence: base })

    expect(withDate).toMatchObject({ newDueDate: '2026-11-25' })
    expect('newDueDate' in without).toBe(false)
  })
})
