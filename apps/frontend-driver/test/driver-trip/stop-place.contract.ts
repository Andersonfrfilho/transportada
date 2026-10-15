/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

import {
  ARRIVED_HIGHLIGHT_MS,
  isTripFullySettled,
  resolveStopPlace,
} from '@/modules/driver-trip/shared/stopPlace.service'
import type { DriverTrip } from '@/modules/driver-trip/shared/driverTrip.types'

const root = resolve(import.meta.dir, '../../src/modules/driver-trip')

describe('fica claro qual é a próxima parada e que a última fecha a viagem (pedido do usuário, 14/10)', () => {
  it('a primeira parada segue "em andamento"; do meio é a próxima; a última se diz última', () => {
    expect(resolveStopPlace({ isCurrent: true, position: { index: 1, total: 5 } })).toBe('first')
    expect(resolveStopPlace({ isCurrent: true, position: { index: 2, total: 5 } })).toBe('next')
    expect(resolveStopPlace({ isCurrent: true, position: { index: 4, total: 5 } })).toBe('next')
    expect(resolveStopPlace({ isCurrent: true, position: { index: 5, total: 5 } })).toBe('last')
    expect(resolveStopPlace({ isCurrent: true, position: { index: 2, total: 2 } })).toBe('last')
  })

  it('só a parada atual recebe lugar; viagem de uma parada ou sem posição não muda nada', () => {
    expect(resolveStopPlace({ isCurrent: false, position: { index: 3, total: 5 } })).toBeUndefined()
    expect(resolveStopPlace({ isCurrent: true, position: { index: 1, total: 1 } })).toBeUndefined()
    expect(resolveStopPlace({ isCurrent: true, position: undefined })).toBeUndefined()
  })

  it('a viagem só está toda resolvida com paradas e todas as notas entregues ou devolvidas', () => {
    const settled = {
      documents: [{ separationStatus: 'delivered' }, { separationStatus: 'returned' }],
    }
    const open = { documents: [{ separationStatus: 'delivered' }, { separationStatus: 'pending' }] }
    const trip = (stops: readonly unknown[]) => ({ stops }) as unknown as DriverTrip
    expect(isTripFullySettled(trip([settled, settled]))).toBe(true)
    expect(isTripFullySettled(trip([settled, open]))).toBe(false)
    expect(isTripFullySettled(trip([]))).toBe(false)
  })

  it('o card mostra "Próxima/Última parada · N de M", o aviso da última e o destaque ao chegar', () => {
    const card = readFileSync(`${root}/components/DriverStopCard.component.tsx`, 'utf8')
    expect(card).toContain("t('stopState.currentLast'")
    expect(card).toContain("t('stopState.currentNext'")
    expect(card).toContain("stopPlace === 'last'")
    expect(card).toContain("t('stopFinalHint')")
    expect(card).toContain('styles.stopJustArrived')
    // `.stopArrived` já é o "Cheguei às…" (inline-flex, verde): no <li> da parada ele quebrava o layout
    expect(card).not.toMatch(/\$\{styles\.stopArrived\}`/u)
    expect(card).toContain('ARRIVED_HIGHLIGHT_MS')
    expect(ARRIVED_HIGHLIGHT_MS).toBeGreaterThan(0)
  })

  it('o destaque de chegada só anima com movimento permitido, e o painel avisa a viagem toda resolvida', () => {
    const css = readFileSync(`${root}/styles/driverTrip.module.css`, 'utf8')
    const motion = css.indexOf(
      '@media (prefers-reduced-motion: no-preference) {\n  .stopJustArrived',
    )
    expect(motion).toBeGreaterThanOrEqual(0)
    const page = readFileSync(`${root}/pages/DriverTripWorkspace.page.tsx`, 'utf8')
    expect(page).toContain('isTripFullySettled(trip)')
    expect(page).toContain("t('tripAllDone')")
    const locale = JSON.parse(readFileSync(`${root}/locales/driverTrip.locale.json`, 'utf8')) as {
      stopState: { currentLast: string; currentNext: string }
      tripAllDone: string
    }
    expect(locale.stopState.currentNext).toContain('{{index}} de {{total}}')
    expect(locale.stopState.currentLast).toContain('{{index}} de {{total}}')
    expect(locale.tripAllDone).toContain('se encerra sozinha')
  })
})
