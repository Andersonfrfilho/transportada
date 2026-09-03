/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REPOSITORY_PATH = 'src/trips/infrastructure/drizzle-trip.repository.ts'
const ROUTES_PATH = 'src/trips/presentation/trip.routes.ts'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Quem opera precisa falar com quem dirige, e a tela mostrava só o nome — o telefone exigia abrir a
 * frota noutra aba. `trip_drivers` guarda o **retrato fiscal** (nome e CPF do momento da viagem); o
 * contato é dado corrente e sai da ficha, por junção na leitura.
 *
 * ⚠️ **Isto torna a viagem o primeiro leitor do telefone do motorista**, e a ADR-0039 decidiu
 * criptografar esse campo. Quem executar a ADR passa a ter de abrir envelope aqui.
 */
describe('o contato do motorista na viagem', () => {
  test('a leitura junta a ficha do motorista, escopada pela empresa', async () => {
    const source = await readApplicationFile(REPOSITORY_PATH)
    const block = source.slice(
      source.indexOf('.from(tripDrivers)') - 800,
      source.indexOf('.from(tripDrivers)') + 700,
    )

    expect(block).toContain('fleetDrivers')
    expect(block).toContain('eq(fleetDrivers.companyId, tripDrivers.companyId)')
    expect(block).toContain('driverEmail')
    expect(block).toContain('driverPhone')
  })

  /** O contato chega ao corpo servido: campo que o serializador não lista não existe para a tela. */
  test('o serializador publica o contato', async () => {
    const source = await readApplicationFile(ROUTES_PATH)

    expect(source).toContain('driverEmail: driver.driverEmail')
    expect(source).toContain('driverPhone: driver.driverPhone')
  })
})
