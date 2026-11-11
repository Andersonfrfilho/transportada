/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'

const infrastructure = new URL('../../src/driver-stop-reminders/infrastructure/', import.meta.url)
const read = (file: string): string => readFileSync(new URL(file, infrastructure), 'utf8')

describe('lembrete de parada: âncora e status da viagem (incidente 11/11/2026)', () => {
  it('a varredura do idle compara a âncora truncada em milissegundos', () => {
    // Postgres guarda microssegundos e o lembrete grava a âncora em ms: sem truncar, um lembrete novo nasce a cada escalada.
    expect(read('drizzle-driver-stop-reminder-idle-reconciliation.repository.ts')).toContain(
      `>= date_trunc('milliseconds', idle_stage.anchor_at)`,
    )
  })

  it('o portão fecha o lembrete de viagem que saiu da rua, mesmo com a parada em aberto', () => {
    const source = read('drizzle-driver-stop-reminder-delivery.repository.ts')
    expect(source).toContain('tripStatus: trips.status')
    expect(source).toContain('TRIP_ON_ROAD_STATUSES')
  })
})
