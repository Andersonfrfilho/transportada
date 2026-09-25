/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  DRIVER_OCCURRENCE_KINDS,
  DRIVER_RETURN_REASONS,
} from '@/modules/driver-trip/shared/driverTrip.types'

/**
 * As duas listas são cópia por valor da API — o bundle não carrega código de lá. Restatá-las aqui
 * como literal guardaria só um lado: se a API ganhasse um motivo novo, este teste continuaria
 * verde e a tela mostraria uma lista curta sem ninguém perceber.
 *
 * Então a paridade é lida do **arquivo da API**, que é a fonte. É um caminho relativo entre apps do
 * mesmo monorepo, num teste — não um `import` de código, que é o que a arquitetura proíbe.
 */
const API_SOURCE = new URL(
  '../../../api-transportada/src/trips/domain/driver-return-reason.policy.ts',
  import.meta.url,
)
const API_SCHEMA_SOURCE = new URL(
  '../../../api-transportada/src/database/trip.schema.ts',
  import.meta.url,
)

async function readStringList(source: URL, constantName: string): Promise<readonly string[]> {
  const text = await Bun.file(source).text()
  const declaration = new RegExp(`export const ${constantName} = \\[([^\\]]*)\\] as const`, 'u')
  const block = declaration.exec(text)
  if (block?.[1] === undefined) throw new Error(`API_CONSTANT_NOT_FOUND_${constantName}`)

  return [...block[1].matchAll(/'([a-z_]+)'/gu)].map((match) => match[1] ?? '')
}

describe('as listas fechadas do campo', () => {
  it('os motivos de não-entrega são os mesmos da API', async () => {
    expect<readonly string[]>([...DRIVER_RETURN_REASONS]).toEqual(
      await readStringList(API_SOURCE, 'DRIVER_RETURN_REASONS'),
    )
  })

  it('os tipos de ocorrência são os mesmos da API', async () => {
    expect<readonly string[]>([...DRIVER_OCCURRENCE_KINDS]).toEqual(
      await readStringList(API_SCHEMA_SOURCE, 'TRIP_STOP_OCCURRENCE_KINDS'),
    )
  })
})
