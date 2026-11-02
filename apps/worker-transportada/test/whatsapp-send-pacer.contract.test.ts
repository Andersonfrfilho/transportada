/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 289: o intervalo entre envios do número. A vaga é reservada antes; o envio só sai quando ela chega, e uma
 * vaga longe demais é recusada em vez de furar o intervalo.
 */
import { describe, expect, test } from 'bun:test'

import {
  createEvolutionSendPacer,
  EvolutionSendPacerBusyError,
} from '../src/whatsapp/infrastructure/evolution-send-pacer.js'

const NOW = new Date('2026-11-01T12:00:00.000Z')

function build(slot: Date | null, maxWaitMs = 20_000) {
  const sleeps: number[] = []
  const pacer = createEvolutionSendPacer({
    claimSlot: async () => slot,
    maxWaitMs,
    now: () => NOW,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds)
    },
  })
  return { pacer, sleeps }
}

describe('Spec 289 — evolution send pacer', () => {
  test('a vaga que já chegou sai na hora, sem esperar', async () => {
    const { pacer, sleeps } = build(new Date(NOW.getTime() - 1_000))
    await pacer.wait('company-1')
    expect(sleeps).toEqual([])
  })

  test('sem configuração da empresa não há vaga e não espera', async () => {
    const { pacer, sleeps } = build(null)
    await pacer.wait('company-1')
    expect(sleeps).toEqual([])
  })

  test('a vaga no futuro espera exatamente até ela, e só então libera o envio', async () => {
    const { pacer, sleeps } = build(new Date(NOW.getTime() + 15_000))
    await pacer.wait('company-1')
    expect(sleeps).toEqual([15_000])
  })

  test('a vaga além do limite de espera é recusada e não dorme', async () => {
    const { pacer, sleeps } = build(new Date(NOW.getTime() + 21_000))
    await expect(pacer.wait('company-1')).rejects.toBeInstanceOf(EvolutionSendPacerBusyError)
    expect(sleeps).toEqual([])
  })

  test('a vaga no limite exato ainda espera', async () => {
    const { pacer, sleeps } = build(new Date(NOW.getTime() + 20_000))
    await pacer.wait('company-1')
    expect(sleeps).toEqual([20_000])
  })
})
