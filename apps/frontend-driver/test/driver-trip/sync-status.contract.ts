/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  resolveSyncAge,
  resolveSyncPhase,
  SYNC_AGE_NOW_THRESHOLD_MS,
} from '@/modules/driver-trip/shared/syncStatus.service'
import driverTrip from '@/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEn from '@/modules/driver-trip/locales/driverTrip.en.locale.json'

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

/**
 * Spec 226 (T3.3): o preview mostrou "Sincronizado agora mesmo" com dois eventos parados na fila. A
 * hora é a da última *leitura* da viagem, não a de a fila estar vazia — e lida sozinha, soa como
 * "está tudo enviado". Com pendência a linha diz que há pendência.
 */
describe('a linha de sincronização não diz que está tudo enviado com evento parado (spec 226)', () => {
  it('com pendência e sem envio em curso a fase é "pendente", e a idade continua à mostra', () => {
    expect(resolveSyncPhase({ isSyncing: false, pendingCount: 2 })).toBe('pending')
  })

  it('sem pendência a fase é "sincronizado"', () => {
    expect(resolveSyncPhase({ isSyncing: false, pendingCount: 0 })).toBe('synced')
  })

  it('enviando, a fase é "enviando", com ou sem pendência contada', () => {
    expect(resolveSyncPhase({ isSyncing: true, pendingCount: 2 })).toBe('syncing')
    expect(resolveSyncPhase({ isSyncing: true, pendingCount: 0 })).toBe('syncing')
  })

  it('o texto da pendência existe nos dois idiomas, no singular e no plural', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.sync.pending_one).toInclude('{{count}}')
      expect(locale.sync.pending_other).toInclude('{{count}}')
    }
  })

  it('a tela usa a fase para escolher o texto', () => {
    const component = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverSyncStatus.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(component).toInclude('resolveSyncPhase(')
    expect(component).toInclude("t('sync.pending'")
  })
})
