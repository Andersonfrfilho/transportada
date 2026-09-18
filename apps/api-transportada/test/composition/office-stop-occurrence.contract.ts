/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15 M5: a ocorrência de parada que o escritório registra em nome do motorista avisa e
 * sugere cobrança como a do motorista. `main.ts` monta os dois caminhos em fábricas diferentes
 * (`createMeTripRoutes`, `createTripFieldOfficeRoutes`), e nada obrigava as duas a mandar o mesmo
 * notificador e a mesma sugestão — o escritório mandava nenhum dos dois.
 */
import { describe, expect, test } from 'bun:test'

const MAIN_PATH = new URL('../../src/main.ts', import.meta.url)

/** O corpo de `reportOccurrence: (input) => reportStopOccurrence({ ... })` dentro da fábrica. */
function readReportOccurrenceWiring(source: string, factory: string): string {
  const factoryStart = source.indexOf(`...${factory}({`)
  if (factoryStart < 0) throw new Error(`${factory} não encontrada em main.ts`)
  const wiringStart = source.indexOf('reportOccurrence: (input) =>', factoryStart)
  if (wiringStart < 0) throw new Error(`reportOccurrence não encontrado em ${factory}`)
  const wiringEnd = source.indexOf('\n      }),', wiringStart)

  return source.slice(wiringStart, wiringEnd)
}

describe('a ocorrência de parada do escritório e a do motorista (spec 156 T15 M5)', () => {
  test('as duas mandam o mesmo notificador e a mesma sugestão de cobrança', async () => {
    const source = await Bun.file(MAIN_PATH).text()

    for (const factory of ['createMeTripRoutes', 'createTripFieldOfficeRoutes']) {
      const wiring = readReportOccurrenceWiring(source, factory)
      expect(wiring).toContain('...stopOccurrenceFollowUp')
    }
  })
})
