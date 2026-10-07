/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: ler os rascunhos de viagem é `fleet.read`, sempre pela empresa do contexto — a
 * prévia de outra empresa é 404 (nunca 403), e a consulta recebe a empresa do contexto, não a do corpo.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoPreviewTripDraftRepositoryPort } from '../../src/cargo-receiving/application/cargo-preview.port.js'
import { createGetCargoPreviewTripDraftsUseCase } from '../../src/cargo-receiving/application/read-cargo-preview-trip-drafts.use-case.js'
import { CargoPreviewNotFoundError } from '../../src/cargo-receiving/domain/cargo-preview.error.js'
import type { TripDraftInput } from '../../src/cargo-receiving/domain/cargo-preview-trip-draft.types.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'

const PREVIEW_ID = '00000000-0000-4000-8000-000000000f01'

const INPUT: TripDraftInput = {
  documents: [
    {
      cityIbgeCode: '3548906',
      cityName: 'São Carlos',
      grossWeightKg: '10.000',
      id: 'doc-a',
      isInLiveTrip: false,
      number: '100',
      recipientName: null,
      series: '1',
      state: 'SP',
      status: 'authorized',
      totalValue: '100.0000',
    },
  ],
  excludedDocumentIds: new Set(),
  items: [
    {
      city: 'SAO CARLOS',
      matchState: 'matched',
      matchedDocumentId: 'doc-a',
      routeName: 'FR.S.CAR',
      rowNumber: 1,
      state: 'SP',
      value: '100.00',
      volumeM3: null,
      weightKg: '10.000',
    },
  ],
  preview: {
    contractorId: 'contractor-1',
    id: PREVIEW_ID,
    plannedDate: '2026-10-05',
    status: 'ready',
  },
  routeLoads: [],
}

function createFixture(found: TripDraftInput | null) {
  const calls: unknown[] = []
  const repository: CargoPreviewTripDraftRepositoryPort = {
    async findInput(params) {
      calls.push(params)
      return found
    },
  }
  return { calls, useCase: createGetCargoPreviewTripDraftsUseCase({ repository }) }
}

describe('ler os rascunhos de viagem da prévia (spec 237 T5.1)', () => {
  test('a consulta recebe a empresa do contexto e o id da prévia, e só eles', async () => {
    const fixture = createFixture(INPUT)

    await fixture.useCase.execute({ context: COMPANY_CONTEXT, previewId: PREVIEW_ID })

    expect(fixture.calls).toEqual([{ companyId: COMPANY_CONTEXT.companyId, previewId: PREVIEW_ID }])
  })

  test('devolve o que a política monta com as linhas lidas', async () => {
    const fixture = createFixture(INPUT)

    const drafts = await fixture.useCase.execute({
      context: COMPANY_CONTEXT,
      previewId: PREVIEW_ID,
    })

    expect(drafts.previewId).toBe(PREVIEW_ID)
    expect(drafts.routableDocumentIds).toEqual(['doc-a'])
    expect(drafts.routes.map((route) => route.routeName)).toEqual(['FR.S.CAR'])
  })

  test('prévia de outra empresa, ou que não existe, é 404 — e não 403', async () => {
    const fixture = createFixture(null)

    await expect(
      fixture.useCase.execute({ context: COMPANY_CONTEXT, previewId: PREVIEW_ID }),
    ).rejects.toBeInstanceOf(CargoPreviewNotFoundError)
  })
})
