/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  resolveSyncAge,
  SYNC_AGE_NOW_THRESHOLD_MS,
} from '@/modules/driver-trip/shared/syncStatus.service'

const NOW_MS = Date.parse('2026-10-01T18:00:00.000Z')
const MINUTE = 60_000

/**
 * Pedido do usuário (01/10): "mesmo se ele não ver tem que existir na nossa tela de pendências para
 * ir sincronizando quando o app está aberto e ele ter o botão de emergência". A drenagem é
 * offline-first e só roda em primeiro plano (sem Background Sync — `security.md` §8, ADR-0056):
 * dizer a idade da última sincronização é o que permite ao motorista perceber que ficou para trás.
 */
describe('idade da última sincronização na tela de pendências (pedido do usuário 01/10)', () => {
  it('sem leitura nenhuma nesta sessão não há idade — a tela não inventa', () => {
    expect(resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: 0 })).toBeUndefined()
  })

  it('abaixo de um minuto é "agora mesmo", nunca "há 0 min"', () => {
    expect(resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: NOW_MS })).toEqual({ unit: 'now' })
    expect(
      resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: NOW_MS - (SYNC_AGE_NOW_THRESHOLD_MS - 1) }),
    ).toEqual({ unit: 'now' })
  })

  it('conta minutos até a primeira hora, e horas a partir dela', () => {
    expect(resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: NOW_MS - MINUTE })).toEqual({
      unit: 'minutes',
      value: 1,
    })
    expect(resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: NOW_MS - 59 * MINUTE })).toEqual({
      unit: 'minutes',
      value: 59,
    })
    expect(resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: NOW_MS - 60 * MINUTE })).toEqual({
      unit: 'hours',
      value: 1,
    })
    expect(resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: NOW_MS - 150 * MINUTE })).toEqual({
      unit: 'hours',
      value: 2,
    })
  })

  /** Relógio do aparelho atrasado em relação ao servidor daria idade negativa na cara do motorista. */
  it('relógio adiantado do servidor não produz idade negativa', () => {
    expect(resolveSyncAge({ nowMs: NOW_MS, syncedAtMs: NOW_MS + 5 * MINUTE })).toEqual({
      unit: 'now',
    })
  })

  it('a tela de pendências mostra o status e o envio em massa com loading', () => {
    const page = readFileSync(
      new URL('../../src/modules/driver-trip/pages/DriverEventQueue.page.tsx', import.meta.url),
      'utf8',
    )

    expect(page).toInclude('<DriverSyncStatus')
    expect(page).toInclude("t(isSyncing ? 'eventQueue.sending' : 'eventQueue.sendAll')")
    /** O pulso é só do que a rede está levando: recusado espera decisão humana, não sinal. */
    expect(page).toInclude("isSyncing && item.status.state !== 'rejected' ? 'true' : undefined")
  })

  /** Movimento é enfeite com função, e quem pediu movimento reduzido fica sem — `web.md` §10. */
  it('a animação do spinner respeita prefers-reduced-motion', () => {
    const stylesheet = readFileSync(
      new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url),
      'utf8',
    )
    const guarded = stylesheet.slice(stylesheet.indexOf('@media (prefers-reduced-motion'))

    expect(guarded).toInclude('driver-sync-spin')
    expect(stylesheet).toInclude('@keyframes driver-sync-spin')
  })
})
