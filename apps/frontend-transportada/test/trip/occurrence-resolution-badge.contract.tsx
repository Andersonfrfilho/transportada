/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T3.2: o selo de andamento na lista e no detalhe. Resolvida (verde) e reaberta pelo motorista
 * (alerta) têm selo; em aberto não tem; cancelada fica com o que o painel já mostra para ela.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceResolutionBadge } from '@/modules/trip/components/OccurrenceResolutionBadge.component'
import { resolveOccurrenceViewState } from '@/modules/trip/shared/occurrenceResolution.service'

const AT = '2026-10-15T12:00:00.000Z'

describe('selo de andamento da ocorrência (spec 266 T3.2)', () => {
  test('resolvida é verde e reaberta pelo motorista é de alerta', () => {
    const resolved = renderToStaticMarkup(
      <OccurrenceResolutionBadge
        resolution={{ actorKind: 'internal', at: AT, state: 'resolved' }}
      />,
    )
    const reopened = renderToStaticMarkup(
      <OccurrenceResolutionBadge resolution={{ actorKind: 'driver', at: AT, state: 'reopened' }} />,
    )

    expect(resolved).toContain('Resolvida')
    expect(resolved).toContain('ui-badge-success')
    expect(reopened).toContain('Reaberta pelo motorista')
    expect(reopened).toContain('ui-badge-warning')
  })

  test('em aberto e cancelada não têm selo próprio', () => {
    const open = renderToStaticMarkup(<OccurrenceResolutionBadge resolution={null} />)
    const cancelled = renderToStaticMarkup(
      <OccurrenceResolutionBadge
        resolution={{ actorKind: 'system', at: AT, state: 'cancelled' }}
      />,
    )

    expect(open).toBe('')
    expect(cancelled).toBe('')
  })
})

describe('estado mostrado no painel (spec 266 T3.2)', () => {
  test('sem andamento é em aberto; com andamento é o próprio estado', () => {
    expect(resolveOccurrenceViewState(null)).toBe('open')
    expect(resolveOccurrenceViewState(undefined)).toBe('open')
    expect(resolveOccurrenceViewState({ actorKind: 'driver', at: AT, state: 'reopened' })).toBe(
      'reopened',
    )
    expect(resolveOccurrenceViewState({ actorKind: null, at: AT, state: 'cancelled' })).toBe(
      'cancelled',
    )
  })
})
