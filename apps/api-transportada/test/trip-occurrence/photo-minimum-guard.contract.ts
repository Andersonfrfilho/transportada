/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.5 (RF1c, RF8): com a foto obrigatória, o registro do motorista confere a quantidade
 * de anexos contra `photoMinimumCount` do tipo, antes de gravar, com código estável. Com a foto
 * opcional ou desligada o mínimo não é lido. A rota leva hoje um anexo só (`attachmentObjectId`).
 */
import { describe, expect, test } from 'bun:test'

import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { TripOccurrencePhotoMinimumNotMetError } from '../../src/trips/domain/trip.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP = '00000000-0000-4000-8000-000000000011'
const UPLOAD = '00000000-0000-4000-8000-0000000000f1'

type PhotoRequirement = {
  readonly attachmentMode: NonNullable<OccurrenceTypeRecord['attachmentMode']>
  readonly photoMinimumCount: number
}

function register(input: PhotoRequirement & { readonly attachmentObjectId: string | null }) {
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
    attachmentObjectId: input.attachmentObjectId,
    companyId: COMPANY,
    documentId: DOCUMENT,
    driverId: '00000000-0000-4000-8000-00000000000d',
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente recusou',
    occurrenceTypeId: TYPE_ID,
    productCode: '',
    repository: {
      findConfirmedUpload: async (query) => (query.id === UPLOAD ? { id: UPLOAD } : null),
      findOccurrenceType: async () => ({
        active: true,
        allowsMultipleItems: true,
        attachmentMode: input.attachmentMode,
        emailBody: '',
        emailSubject: '',
        emailTemplateKey: null,
        id: TYPE_ID,
        name: 'Recusa total',
        notifies: false,
        photoMinimumCount: input.photoMinimumCount,
        stage: 'delivery',
      }),
      findOccurrenceTypeOverrides: async () => ({
        contractorOverrides: [],
        recipientOverrides: [],
      }),
      findReachableDocument: async () => ({ tripId: TRIP }),
      listDocumentProducts: async () => [],
    },
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

describe('o registro do motorista confere o mínimo de fotos (spec 246 T1d.5, RF8)', () => {
  test('foto obrigatória com mínimo 2 e um anexo: 422 com código estável, nada gravado', async () => {
    const { result, state } = register({
      attachmentMode: 'required',
      attachmentObjectId: UPLOAD,
      photoMinimumCount: 2,
    })

    const error = await rejection(result)

    expect(error).toBeInstanceOf(TripOccurrencePhotoMinimumNotMetError)
    expect((error as TripOccurrencePhotoMinimumNotMetError).status).toBe(422)
    expect((error as TripOccurrencePhotoMinimumNotMetError).code).toBe(
      'TRIP_OCCURRENCE_PHOTO_MINIMUM_NOT_MET',
    )
    expect(state.documentOccurrences.size).toBe(0)
  })

  test('foto obrigatória com mínimo 1 e um anexo grava', async () => {
    const { result, state } = register({
      attachmentMode: 'required',
      attachmentObjectId: UPLOAD,
      photoMinimumCount: 1,
    })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })

  test('foto opcional não lê o mínimo: sem anexo e mínimo 3 grava', async () => {
    const { result, state } = register({
      attachmentMode: 'optional',
      attachmentObjectId: null,
      photoMinimumCount: 3,
    })

    await result

    expect(state.documentOccurrences.size).toBe(1)
  })
})
