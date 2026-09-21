/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T5 (D1/RF4, CA2): a foto da ocorrência de galpão é obrigatória **no caso de uso**, não
 * na rota — a recusa acontece antes de `saveOccurrence`, do storage e da auditoria. A prova é que o
 * dublê de repositório não é chamado quando a foto falta.
 */
import { describe, expect, test } from 'bun:test'

import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { OccurrencePhotoRequiredError } from '../../src/trips/domain/trip.error.js'

const TIPO = '00000000-0000-4000-8000-0000000000e1'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const ACTOR_USER_ID = '00000000-0000-4000-8000-00000000000f'

function buildCalls() {
  return { notified: 0, saved: 0 }
}

function registrar(input: {
  readonly attachment?: { readonly bytes: Uint8Array; readonly mimeType: string }
  readonly calls: { notified: number; saved: number }
}) {
  return registerTripOccurrence({
    actorUserId: ACTOR_USER_ID,
    ...(input.attachment === undefined ? {} : { attachment: input.attachment }),
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    note: '',
    notificationParameters: {
      documentId: DOCUMENT_ID,
      documentLabel: '883658/1',
      occurrenceType: '',
      stopLabel: '',
      tripId: TRIP_ID,
    },
    notifier: {
      async notify() {
        input.calls.notified += 1
      },
    },
    occurredOn: '21/09/2026',
    occurrenceTypeId: TIPO,
    productCode: '',
    repository: {
      async findOccurrenceType() {
        return {
          active: true,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: TIPO,
          name: 'Item faltante',
          notifies: true,
          stage: 'separation' as const,
        }
      },
      async listDocumentProducts() {
        return []
      },
      async listOccurrences() {
        return []
      },
      async readTemplateValues() {
        throw new Error('TEMPLATE_NOT_EXPECTED')
      },
      async saveOccurrence(saved) {
        input.calls.saved += 1
        return {
          createdAt: '2026-09-21T12:00:00.000Z',
          id: '00000000-0000-4000-8000-0000000000c1',
          note: '',
          occurrenceTypeId: TIPO,
          productCode: '',
          stage: saved.stage,
          typeName: saved.typeName,
        }
      },
    },
    tripId: TRIP_ID,
  })
}

describe('a foto é obrigatória na ocorrência de galpão (spec 161 T5, D1/RF4)', () => {
  test('CA2: sem foto responde 422 OCCURRENCE_PHOTO_REQUIRED e o dublê de repositório não é chamado', async () => {
    const calls = buildCalls()

    const error = await registrar({ calls }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OccurrencePhotoRequiredError)
    expect(error).toMatchObject({ code: 'OCCURRENCE_PHOTO_REQUIRED', status: 422 })
    expect(calls).toEqual({ notified: 0, saved: 0 })
  })

  test('com foto grava e avisa normalmente', async () => {
    const calls = buildCalls()

    const registered = await registrar({
      attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      calls,
    })

    expect(registered.typeName).toBe('Item faltante')
    expect(calls).toEqual({ notified: 1, saved: 1 })
  })
})
