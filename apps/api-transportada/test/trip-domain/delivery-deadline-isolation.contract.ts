/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 CA6 / D3: o prazo de entrega só informa. Nota do motorista, pontualidade do comprovante,
 * `missingAfterHours`, CT-e e a fila de comprovantes não podem importá-lo — o importador é que
 * passaria a depender do calendário, e a nota passaria a mudar com o feriado.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../../', import.meta.url)
const DEADLINE_MODULE_NEEDLE = 'delivery-deadline'
const GUARDED_GLOBS = [
  'src/fleet/**/*.ts',
  'src/cte-*/**/*.ts',
  'src/trips/domain/delivery-proof-*.ts',
  'src/trips/infrastructure/proof-pending.query.ts',
  'src/trips/infrastructure/drizzle-current-driver-trip.repository.ts',
] as const
const KNOWN_GUARDED_FILES = [
  'src/fleet/domain/driver-score.policy.ts',
  'src/trips/domain/delivery-proof-settings.policy.ts',
  'src/trips/infrastructure/proof-pending.query.ts',
  'src/trips/infrastructure/drizzle-current-driver-trip.repository.ts',
] as const

async function listGuardedFiles(): Promise<readonly string[]> {
  const files = new Set<string>()
  for (const pattern of GUARDED_GLOBS) {
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd: APPLICATION_ROOT.pathname })) files.add(file)
  }

  return [...files].sort()
}

describe('spec 236 — o prazo de entrega não toca o que mede o motorista nem o fiscal', () => {
  test('a lista vigiada acha os arquivos que importam', async () => {
    const files = await listGuardedFiles()

    for (const known of KNOWN_GUARDED_FILES) expect(files).toContain(known)
  })

  test('nenhum arquivo vigiado importa o prazo de entrega', async () => {
    const files = await listGuardedFiles()
    const importers: string[] = []
    for (const file of files) {
      const source = await Bun.file(new URL(file, APPLICATION_ROOT)).text()
      if (source.includes(DEADLINE_MODULE_NEEDLE)) importers.push(file)
    }

    expect(importers).toEqual([])
  })
})
