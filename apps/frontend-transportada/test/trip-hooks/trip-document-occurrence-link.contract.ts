/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 T3.1 (CA04): o link da ocorrência na nota aberta navega na mesma aba, sem recarregar.
 * O painel não tem router — o `onClick` cancela a navegação do navegador e empilha o caminho com
 * `pushState`; o `href` fica para "abrir em outra aba". Dados sintéticos.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripDocumentOccurrences } from '../../src/modules/trip/components/TripDocumentOccurrences.component'
import type { TripWorkspaceController } from '../../src/modules/trip/hooks/useTripWorkspace.hook'
import type { TripDocumentDetail } from '../../src/modules/trip/shared/trip.types'

let root: Root | undefined
let container: HTMLDivElement | undefined

function renderSection(canReadTripFleetDetails: boolean): HTMLElement {
  const workspace = {
    controller: { canManageTrips: false, canReadTripFleetDetails },
    documentProductsQuery: { data: [] },
    isSendingOccurrencePhotos: false,
    lastOccurrenceEmail: null,
    occurrencePhotoSendState: [],
    occurrenceTypesQuery: { data: [] },
    occurrencesQuery: {
      data: [
        {
          createdAt: '2026-10-01T10:00:00.000Z',
          id: 'occ-1',
          note: '',
          occurrenceTypeId: 'type-1',
          productCode: '',
          stage: 'delivery',
          typeName: 'Avaria',
        },
      ],
    },
    resetSeparationOccurrencePhotoSend: () => undefined,
    sendSeparationOccurrencePhotos: () => Promise.resolve({ hasFailure: false }),
  } as unknown as TripWorkspaceController
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root?.render(
      createElement(TripDocumentOccurrences, {
        document: { id: 'document-1', tripId: 'trip-1' } as unknown as TripDocumentDetail,
        workspace,
      }),
    ),
  )
  return container
}

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  window.history.replaceState(null, '', '/')
})

describe('o link da ocorrência na nota aberta (spec 233 CA04)', () => {
  it('o clique cancela a navegação do navegador e leva a /ocorrencias/:id na mesma aba', () => {
    const dom = renderSection(true)
    const link = dom.querySelector<HTMLAnchorElement>('a')
    const click = new window.MouseEvent('click', { bubbles: true, cancelable: true })

    act(() => void link?.dispatchEvent(click))

    expect(click.defaultPrevented).toBe(true)
    expect(window.location.pathname).toBe('/ocorrencias/occ-1')
  })

  it('sem permissão não há link: o clique no tipo não leva a lugar nenhum', () => {
    const dom = renderSection(false)

    expect(dom.querySelector('a')).toBeNull()
    expect(dom.textContent).toInclude('Avaria')
    expect(window.location.pathname).toBe('/')
  })
})
