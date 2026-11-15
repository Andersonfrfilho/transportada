/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 CA3 (ADR-0044 §1): a ordem do rascunho é por estrada ou não é. OSRM fora do ar deixa a ordem de chegada com
 * o código estável; nunca cai para a distância em linha reta. O jeito de garantir isso é o módulo não ter a linha reta à
 * mão: nenhum arquivo do ordenador cita `haversine` nem importa o cálculo de distância por coordenada.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../../', import.meta.url)
const GUARDED_GLOBS = [
  'src/trips/domain/draft-stop-order*.ts',
  'src/trips/application/road-matrix.port.ts',
  'src/trips/application/order-draft-trip-stops*.ts',
  'src/trips/infrastructure/osrm-road-matrix.gateway.ts',
] as const
const KNOWN_GUARDED_FILES = [
  'src/trips/domain/draft-stop-order.constant.ts',
  'src/trips/domain/draft-stop-order.policy.ts',
  'src/trips/application/road-matrix.port.ts',
  'src/trips/infrastructure/osrm-road-matrix.gateway.ts',
] as const
const STRAIGHT_LINE_NEEDLES = [
  /haversine/iu,
  /coordinate-distance/u,
  /straight[-_ ]?line/iu,
] as const

async function listGuardedFiles(): Promise<readonly string[]> {
  const files = new Set<string>()
  for (const pattern of GUARDED_GLOBS) {
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd: APPLICATION_ROOT.pathname })) files.add(file)
  }

  return [...files].sort()
}

describe('spec 323 — o ordenador do rascunho não tem linha reta', () => {
  test('a lista vigiada acha os arquivos do ordenador', async () => {
    const files = await listGuardedFiles()

    for (const known of KNOWN_GUARDED_FILES) expect(files).toContain(known)
  })

  test('nenhum arquivo do ordenador cita haversine nem importa a distância por coordenada', async () => {
    const offenders: string[] = []
    for (const file of await listGuardedFiles()) {
      const source = await Bun.file(new URL(file, APPLICATION_ROOT)).text()
      if (STRAIGHT_LINE_NEEDLES.some((needle) => needle.test(source))) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })
})
