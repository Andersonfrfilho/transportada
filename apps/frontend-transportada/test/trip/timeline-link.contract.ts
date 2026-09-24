import { describe, expect, it } from 'bun:test'

import {
  buildTripTimelineDocumentAnchorId,
  buildTripTimelineStopAnchorId,
  resolveTripTimelineDocumentHref,
  resolveTripTimelineStopHref,
} from '../../src/modules/trip/shared/tripTimelineLink.service'

/**
 * Spec 180 RF15/RF18 (CA13): o evento leva à coisa. Sem router no app, o link é uma âncora de
 * página (`href="#id"`) para o mesmo id que `TripStopList` marca na nota/parada — nunca requisição
 * nova, nunca id cru sem o prefixo que evita colidir com outro elemento da página.
 */
describe('link do evento para a nota e para a parada (spec 180 RF15)', () => {
  it('o href da nota aponta para o id que a linha da nota carrega', () => {
    expect(resolveTripTimelineDocumentHref('doc-1')).toBe('#trip-timeline-document-doc-1')
    expect(buildTripTimelineDocumentAnchorId('doc-1')).toBe('trip-timeline-document-doc-1')
  })

  it('o href da parada aponta para o id que o card da parada carrega', () => {
    expect(resolveTripTimelineStopHref('stop-1')).toBe('#trip-timeline-stop-stop-1')
    expect(buildTripTimelineStopAnchorId('stop-1')).toBe('trip-timeline-stop-stop-1')
  })

  it('ids diferentes produzem hrefs diferentes — sem colisão entre notas', () => {
    expect(resolveTripTimelineDocumentHref('doc-1')).not.toBe(resolveTripTimelineDocumentHref('doc-2'))
  })
})
