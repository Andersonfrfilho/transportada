/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6, RF13): o módulo do aviso é reaproveitável pelo app do motorista (T4.3) e por isso
 * não pode depender do prazo de entrega da 236 — o contrato de isolamento
 * (`test/trip-domain/delivery-deadline-isolation.contract.ts`) casa a agulha `delivery-deadline` nos
 * arquivos que medem o motorista, e um módulo que importasse o prazo arrastaria o motorista para dentro dele.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../../', import.meta.url)
const WARNING_MODULE_GLOBS = [
  'src/business-calendar/**/holiday-warning*.ts',
  'src/business-calendar/**/day-checks*.ts',
] as const
const KNOWN_WARNING_FILES = [
  'src/business-calendar/domain/holiday-warning.policy.ts',
  'src/business-calendar/infrastructure/holiday-warning.reader.ts',
  'src/business-calendar/application/day-checks.use-case.ts',
  'src/business-calendar/presentation/day-checks.routes.ts',
] as const
const DEADLINE_MODULE_NEEDLE = 'delivery-deadline'

async function listWarningFiles(): Promise<readonly string[]> {
  const files = new Set<string>()
  for (const pattern of WARNING_MODULE_GLOBS) {
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd: APPLICATION_ROOT.pathname })) files.add(file)
  }

  return [...files].sort()
}

describe('spec 252 — o módulo do aviso não conhece o prazo de entrega', () => {
  test('a varredura acha os arquivos do módulo', async () => {
    const files = await listWarningFiles()

    for (const known of KNOWN_WARNING_FILES) expect(files).toContain(known)
  })

  test('nenhum arquivo do módulo importa nem cita o prazo de entrega', async () => {
    const importers: string[] = []
    for (const file of await listWarningFiles()) {
      const source = await Bun.file(new URL(file, APPLICATION_ROOT)).text()
      if (source.includes(DEADLINE_MODULE_NEEDLE)) importers.push(file)
    }

    expect(importers).toEqual([])
  })
})
