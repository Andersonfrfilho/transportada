/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.1: a política não lê fuso. As linhas 1, 18 e 19 dão o mesmo resultado com o processo
 * em São Paulo (UTC−3) e em Kiritimati (UTC+14) — os dois lados da virada do dia em UTC. O fuso só
 * entra na borda, em `toCivilDate`, quando um instante vira data civil.
 */
import { describe, expect, test } from 'bun:test'

import { toCivilDate } from '../../src/business-calendar/application/civil-date.service.js'

const PROBE_PATH = new URL('./time-zone-probe.ts', import.meta.url).pathname
const EXPECTED_RESULTS = ['2026-10-16', '2026-12-30', '2028-01-03']
const PROBED_TIME_ZONES = ['America/Sao_Paulo', 'Pacific/Kiritimati', 'UTC'] as const

type ProbeOutput = {
  readonly results: readonly string[]
  readonly timeZone: string
}

function runProbe(timeZone: string): ProbeOutput {
  const probe = Bun.spawnSync({
    cmd: [process.execPath, PROBE_PATH],
    env: { ...process.env, TZ: timeZone },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  if (probe.exitCode !== 0) throw new Error(probe.stderr.toString())

  return JSON.parse(probe.stdout.toString()) as ProbeOutput
}

describe('spec 238 — o fuso do processo não muda a conta', () => {
  for (const timeZone of PROBED_TIME_ZONES) {
    test(`linhas 1, 18 e 19 com TZ=${timeZone}`, () => {
      const output = runProbe(timeZone)

      expect(output.timeZone).toBe(timeZone)
      expect(output.results).toEqual(EXPECTED_RESULTS)
    })
  }
})

describe('spec 238 — o instante vira data civil no fuso informado', () => {
  test('02:30 UTC de 10/10 ainda é 09/10 em São Paulo', () => {
    const instant = new Date('2026-10-10T02:30:00.000Z')

    expect(toCivilDate({ instant, timeZone: 'America/Sao_Paulo' })).toBe('2026-10-09')
    expect(toCivilDate({ instant, timeZone: 'UTC' })).toBe('2026-10-10')
  })

  test('a virada do ano respeita o fuso', () => {
    const instant = new Date('2027-01-01T01:00:00.000Z')

    expect(toCivilDate({ instant, timeZone: 'America/Sao_Paulo' })).toBe('2026-12-31')
    expect(toCivilDate({ instant, timeZone: 'Pacific/Kiritimati' })).toBe('2027-01-01')
  })
})
