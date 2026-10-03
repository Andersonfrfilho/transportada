/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { DriverProofOutcomeNotice } from '../../src/modules/driver-trip/components/DriverProofOutcomeNotice.component'
import { i18n } from '../../src/modules/shared/i18n/i18n.service'

/**
 * Spec 234 D4d: sem a localização da entrega a foto conta como "longe" (D4c). O motorista que tocou
 * "Entreguei" com o GPS desligado e fotografou no local lia "Registrada longe do local", o que é falso
 * para ele — o texto passa a cobrir a falta de localização também.
 */
function renderOutcome(outcome: 'away' | 'late_and_away'): string {
  return renderToStaticMarkup(
    createElement(DriverProofOutcomeNotice, {
      label: undefined,
      onDismiss: () => undefined,
      outcome,
    }),
  )
}

describe('o resultado da foto cobre a entrega sem localização (spec 234 D4d)', () => {
  it('away: longe do local OU sem a localização da entrega', async () => {
    await i18n.changeLanguage('pt-BR')

    expect(renderOutcome('away')).toContain(
      'Registrada longe do local ou sem a localização da entrega — pode ter tirado pontos da sua nota.',
    )
  })

  it('late_and_away: fora do prazo e longe do local (ou sem a localização)', async () => {
    await i18n.changeLanguage('pt-BR')

    expect(renderOutcome('late_and_away')).toContain(
      'Registrada fora do prazo e longe do local (ou sem a localização da entrega) — pode ter tirado pontos da sua nota.',
    )
  })

  it('o resultado só de atraso não fala de localização', async () => {
    await i18n.changeLanguage('pt-BR')
    const t = i18n.getFixedT('pt-BR', 'driverTrip')

    expect(t('pendingProofs.outcome.late')).not.toContain('localização')
  })

  it('a dica da nota diz que a falta de localização também tira pontos', async () => {
    await i18n.changeLanguage('pt-BR')
    const t = i18n.getFixedT('pt-BR', 'driverTrip')

    expect(t('profile.scoreHint')).toContain('longe do local da entrega, ou sem a localização dela')
  })

  it('o par em inglês diz o mesmo', () => {
    const t = i18n.getFixedT('en', 'driverTrip')

    expect(t('pendingProofs.outcome.away')).toBe(
      'Recorded far from the location or without the delivery location — may have cost points on your score.',
    )
    expect(t('pendingProofs.outcome.late_and_away')).toBe(
      'Recorded past the deadline and far from the location (or without the delivery location) — may have cost points on your score.',
    )
    expect(t('profile.scoreHint')).toContain(
      'away from the delivery location or without its location',
    )
  })
})
