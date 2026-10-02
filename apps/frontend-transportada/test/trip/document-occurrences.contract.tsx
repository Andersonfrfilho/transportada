/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 T3.1 (RF6, CA04) — a seção "Ocorrências" da nota aberta: lista direta, cada ocorrência
 * com link para `/ocorrencias/:id`, e "Nenhuma ocorrência registrada" quando não há. Cobre o
 * **renderizado**; o clique do link e a busca ficam em `test/trip-hooks`. Dados sintéticos.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { TripDocumentOccurrences } from '@/modules/trip/components/TripDocumentOccurrences.component'
import type { TripWorkspaceController } from '@/modules/trip/hooks/useTripWorkspace.hook'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import tripPt from '@/modules/trip/locales/trip.locale.json'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { TripDocumentDetail, TripOccurrence } from '@/modules/trip/shared/trip.types'

const DOCUMENT = { id: 'document-1', tripId: 'trip-1' } as unknown as TripDocumentDetail

function buildOccurrence(id: string, typeName: string): TripOccurrence {
  return {
    createdAt: '2026-10-01T10:00:00.000Z',
    id,
    note: '',
    occurrenceTypeId: 'type-1',
    productCode: '',
    stage: 'delivery',
    typeName,
  }
}

function render(
  options: Readonly<{ canReadTripFleetDetails: boolean; occurrences: readonly TripOccurrence[] }>,
): string {
  const workspace = {
    controller: { canManageTrips: false, canReadTripFleetDetails: options.canReadTripFleetDetails },
    documentProductsQuery: { data: [] },
    isSendingOccurrencePhotos: false,
    lastOccurrenceEmail: null,
    occurrencePhotoSendState: [],
    occurrenceTypesQuery: { data: [] },
    occurrencesQuery: { data: options.occurrences },
    resetSeparationOccurrencePhotoSend: () => undefined,
    sendSeparationOccurrencePhotos: () => Promise.resolve({ hasFailure: false }),
  } as unknown as TripWorkspaceController
  return renderToStaticMarkup(<TripDocumentOccurrences document={DOCUMENT} workspace={workspace} />)
}

const SEPARATION_TYPE = {
  active: true,
  id: 'type-1',
  stage: 'separation',
} as unknown as OccurrenceType

/** Quem gerencia viagens, com um tipo de separação ativo: o único cenário em que o formulário poderia aparecer. */
function renderAsManager(document: TripDocumentDetail): string {
  const workspace = {
    controller: { canManageTrips: true, canReadTripFleetDetails: true },
    documentProductsQuery: { data: [] },
    isSendingOccurrencePhotos: false,
    lastOccurrenceEmail: null,
    occurrencePhotoSendState: [],
    occurrenceTypesQuery: { data: [SEPARATION_TYPE] },
    occurrencesQuery: { data: [] },
    resetSeparationOccurrencePhotoSend: () => undefined,
    sendSeparationOccurrencePhotos: () => Promise.resolve({ hasFailure: false }),
  } as unknown as TripWorkspaceController
  return renderToStaticMarkup(<TripDocumentOccurrences document={document} workspace={workspace} />)
}

describe('a seção Ocorrências da nota aberta (spec 233 RF6)', () => {
  /**
   * A lista aparece em toda nota aberta, mas o **formulário** de registro continua só onde já estava: dentro
   * do comprovante, de nota entregue ou devolvida. Numa nota não entregue a busca de itens não roda, então o
   * formulário listaria produtos só pelo código — e duplicaria o botão "Ocorrência" da separação (spec 182).
   */
  it('o botão de registrar só aparece na nota entregue ou devolvida, mesmo para quem gerencia', () => {
    const delivered = { ...DOCUMENT, deliveredAt: '2026-10-01T10:00:00.000Z', returnedAt: null }
    const returned = { ...DOCUMENT, deliveredAt: null, returnedAt: '2026-10-01T10:00:00.000Z' }
    const pending = { ...DOCUMENT, deliveredAt: null, returnedAt: null }

    expect(renderAsManager(delivered as TripDocumentDetail)).toContain(tripPt.occurrence.register)
    expect(renderAsManager(returned as TripDocumentDetail)).toContain(tripPt.occurrence.register)
    expect(renderAsManager(pending as TripDocumentDetail)).not.toContain(tripPt.occurrence.register)
  })

  it('lista as ocorrências direto, sem expansão no meio', () => {
    const markup = render({
      canReadTripFleetDetails: true,
      occurrences: [buildOccurrence('occ-1', 'Avaria'), buildOccurrence('occ-2', 'Falta')],
    })

    expect(markup).toContain('Avaria')
    expect(markup).toContain('Falta')
    expect(markup).not.toContain('aria-expanded')
    expect(markup).toContain(`aria-label="${tripPt.occurrence.title}"`)
  })

  it('cada ocorrência leva a /ocorrencias/:id pelo href — abrir em outra aba funciona', () => {
    const markup = render({
      canReadTripFleetDetails: true,
      occurrences: [buildOccurrence('occ-1', 'Avaria'), buildOccurrence('occ-2', 'Falta')],
    })

    expect(markup).toMatch(/<a [^>]*href="\/ocorrencias\/occ-1"[^>]*>Avaria<\/a>/u)
    expect(markup).toMatch(/<a [^>]*href="\/ocorrencias\/occ-2"[^>]*>Falta<\/a>/u)
  })

  it('sem permissão para abrir a ocorrência, ela continua listada, sem link', () => {
    const markup = render({
      canReadTripFleetDetails: false,
      occurrences: [buildOccurrence('occ-1', 'Avaria')],
    })

    expect(markup).toContain('Avaria')
    expect(markup).not.toContain('/ocorrencias/')
    expect(markup).not.toContain('<a ')
  })

  it('sem ocorrência: o aviso de que não há, nos dois idiomas', () => {
    const markup = render({ canReadTripFleetDetails: true, occurrences: [] })

    expect(markup).toContain('Nenhuma ocorrência registrada.')
    expect(tripPt.occurrence.none).toBe('Nenhuma ocorrência registrada.')
    expect(tripEn.occurrence.none).toBe('No occurrence registered.')
  })

  it('a terceira expansão do comprovante saiu dos dois idiomas', () => {
    expect('occurrencesToggle' in tripPt.deliveryProof).toBe(false)
    expect('occurrencesCollapse' in tripPt.deliveryProof).toBe(false)
    expect('occurrencesToggle' in tripEn.deliveryProof).toBe(false)
    expect('occurrencesCollapse' in tripEn.deliveryProof).toBe(false)
  })
})
