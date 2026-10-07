/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N10): toda instância de `DrizzleCurrentDriverTripRepository` na composição recebe o
 * logger. Sem ele a falha de leitura de produtos do snapshot some calada — foi o que o canal do
 * WhatsApp fazia, e só dava para ver no log do outro canal.
 */
import { describe, expect, test } from 'bun:test'

const MAIN_URL = new URL('../../src/main.ts', import.meta.url)
const INSTANCE_PATTERN = /new DrizzleCurrentDriverTripRepository\(([^)]*)\)/g

describe('o repositório do snapshot do motorista sempre leva o logger (spec 247 T7.2b N10)', () => {
  test('cada instância na composição passa o logger', async () => {
    const source = await Bun.file(MAIN_URL).text()

    const instances = [...source.matchAll(INSTANCE_PATTERN)].map((match) => match[1] ?? '')

    expect(instances.length).toBeGreaterThanOrEqual(2)
    for (const argumentsText of instances) expect(argumentsText).toContain('logger')
  })
})
