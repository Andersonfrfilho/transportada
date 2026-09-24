/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

/**
 * Spec 161: o registro devolve o anexo no formato **estreito** (`{ id, position }`, sem URL — RF6,
 * D5). Validá-lo com o formato completo de leitura recusava a resposta legítima inteira, a tela
 * mostrava `TRIP_RESPONSE_INVALID` na foto 1 e a fila parava antes da foto 2 (medido em staging).
 */
const REGISTERED = {
  actorName: 'Operador',
  attachments: [{ id: 'attachment-1', position: 1 }],
  channel: 'driver_app',
  createdAt: '2026-09-22T13:04:52.000Z',
  email: null,
  id: 'occurrence-1',
  note: 'Item avariado',
  occurrenceTypeId: 'type-1',
  onBehalfOfDriverName: null,
  productCode: '183',
  stage: 'separation',
  typeName: 'Item avariado',
} as const

describe('registeredOccurrenceFromApi', () => {
  test('aceita o anexo estreito que a rota de registro devolve', () => {
    const adapters = createTripResponseAdapters()

    const registered = adapters.registeredOccurrenceFromApi({ ...REGISTERED })

    expect(registered.attachments).toEqual([{ id: 'attachment-1', position: 1 }])
    expect(registered.email).toBeNull()
  })

  test('sem anexo na resposta vira lista vazia, não erro', () => {
    const adapters = createTripResponseAdapters()
    const withoutAttachments = { ...REGISTERED, attachments: undefined }
    delete (withoutAttachments as { attachments?: unknown }).attachments

    expect(adapters.registeredOccurrenceFromApi(withoutAttachments).attachments).toEqual([])
  })

  test('anexo fora do formato estreito ainda é recusado', () => {
    const adapters = createTripResponseAdapters()

    expect(() =>
      adapters.registeredOccurrenceFromApi({
        ...REGISTERED,
        attachments: [{ id: 'attachment-1', position: '1' }],
      }),
    ).toThrow()
  })
})
