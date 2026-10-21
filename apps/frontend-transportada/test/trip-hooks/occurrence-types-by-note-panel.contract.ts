/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.4 (R6): o formulário de ocorrência do galpão oferece o que o servidor entregou para a nota e,
 * quando a nota não recebe nenhum tipo, diz isso em vez de sumir com o botão calado. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { TripDocumentOccurrences } from '@/modules/trip/components/TripDocumentOccurrences.component'
import { TripOccurrences } from '@/modules/trip/components/TripOccurrences.component'
import type { TripWorkspaceController } from '@/modules/trip/hooks/useTripWorkspace.hook'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { TripDocumentDetail } from '@/modules/trip/shared/trip.types'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { buttonByText, click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'
import { createUnexpectedTripClient } from '../fixtures/tripAssemblyHooks.fixture'
import { tripHookFakes } from './tripClientMocks.helper'

const mounted: { unmount: () => void }[] = []
const EMPTY_MESSAGE = 'Nenhum tipo de ocorrência de galpão vale para a contratante desta nota.'

function buildType(id: string, name: string): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'off',
    emailTemplateKey: null,
    flow: 'document',
    id,
    itemsMode: 'off',
    leavesDocumentBehind: false,
    name,
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'separation',
  }
}

async function mount(input: {
  readonly areTypesLoading?: boolean
  readonly types: readonly OccurrenceType[]
}): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(TripOccurrences, {
        ...(input.areTypesLoading === undefined ? {} : { areTypesLoading: input.areTypesLoading }),
        canRegister: true,
        isRegistering: false,
        occurrences: [],
        onRegister: () => Promise.resolve({ hasFailure: false }),
        onReset: () => undefined,
        photoSendState: [],
        products: [],
        types: input.types,
      }),
    ),
  )
}

async function scenario(body: () => Promise<void>): Promise<void> {
  const restoreLayout = stubVisibleLayout()
  try {
    await body()
  } finally {
    restoreLayout()
    for (const rendered of mounted.splice(0)) rendered.unmount()
  }
}

describe('os tipos do galpão por nota (spec 270 T3.4)', () => {
  test('a nota sem nenhum tipo diz que nenhum vale para a contratante, sem botão de registrar', async () => {
    await scenario(async () => {
      await mount({ types: [] })

      expect(document.body.textContent).toContain(EMPTY_MESSAGE)
      expect(
        [...document.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('Registrar ocorrência'),
        ),
      ).toBe(false)
    })
  })

  test('enquanto a lista da nota carrega, não diz que não há tipo', async () => {
    await scenario(async () => {
      await mount({ areTypesLoading: true, types: [] })

      expect(document.body.textContent).not.toContain(EMPTY_MESSAGE)
    })
  })

  test('a lista do servidor é oferecida como veio, e o primeiro tipo é o escolhido', async () => {
    await scenario(async () => {
      await mount({ types: [buildType('t-1', 'Item faltante'), buildType('t-2', 'Caixa violada')] })

      expect(document.body.textContent).not.toContain(EMPTY_MESSAGE)
      await click(buttonByText('Registrar ocorrência'))
      expect(document.body.textContent).toContain('Item faltante')
    })
  })
})

describe('a nota aberta pede os tipos do galpão ao servidor, por nota (spec 270 T3.4)', () => {
  test('GET dos tipos da nota da viagem, e o que volta é o que se oferece', async () => {
    const calls: unknown[] = []
    tripHookFakes.tripClient = {
      ...createUnexpectedTripClient(),
      listSeparationOccurrenceTypes: (input) => {
        calls.push(input)
        return Promise.resolve([buildType('t-1', 'Item faltante')])
      },
    }
    const workspace = {
      controller: { canManageTrips: true, canReadTripFleetDetails: false },
      documentProductsQuery: { data: [] },
      isSendingOccurrencePhotos: false,
      occurrencePhotoSendState: [],
      occurrencesQuery: { data: [] },
      resetSeparationOccurrencePhotoSend: () => undefined,
      sendSeparationOccurrencePhotos: () => Promise.resolve({ hasFailure: false }),
    } as unknown as TripWorkspaceController
    const restoreLayout = stubVisibleLayout()
    try {
      mounted.push(
        await renderWithQueryClient(
          createElement(TripDocumentOccurrences, {
            document: {
              deliveredAt: '2026-10-01T10:00:00.000Z',
              id: 'document-1',
              returnedAt: null,
              tripId: 'trip-1',
            } as unknown as TripDocumentDetail,
            workspace,
          }),
        ),
      )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(calls).toEqual([{ documentId: 'document-1', tripId: 'trip-1' }])
      expect(
        [...document.querySelectorAll('button')].some((button) =>
          button.textContent?.includes('Registrar ocorrência'),
        ),
      ).toBe(true)
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
    }
  })
})
