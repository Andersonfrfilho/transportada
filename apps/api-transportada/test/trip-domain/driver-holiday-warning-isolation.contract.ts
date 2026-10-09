/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (ADR-0100 D12, CA16): o feriado só avisa o motorista, nunca o mede. A nota do motorista, a
 * pontualidade do comprovante, o `missingAfterHours`, a fila de comprovantes e o repositório da leitura
 * `GET /me/trips/current` não importam o calendário nem o módulo do aviso — quem chama o aviso é o caso de
 * uso. E o aviso do motorista não reaproveita o suporte do detalhe da viagem, que carrega o prazo da 236.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../../', import.meta.url)
const CALENDAR_NEEDLES = ['business-calendar', 'holiday-warning'] as const
const DEADLINE_NEEDLES = ['delivery-deadline', 'trip-holiday-warning.support'] as const
const SCORE_AND_PROOF_GLOBS = [
  'src/fleet/**/*.ts',
  'src/cte-*/**/*.ts',
  'src/trips/domain/delivery-proof-*.ts',
  'src/trips/infrastructure/proof-pending.query.ts',
  'src/trips/infrastructure/drizzle-current-driver-trip.repository.ts',
] as const
const KNOWN_SCORE_AND_PROOF_FILES = [
  'src/fleet/domain/driver-score.policy.ts',
  'src/trips/domain/delivery-proof-settings.policy.ts',
  'src/trips/infrastructure/proof-pending.query.ts',
  'src/trips/infrastructure/drizzle-current-driver-trip.repository.ts',
] as const
const DRIVER_WARNING_FILES = [
  'src/trips/application/attach-driver-stop-holiday-warnings.service.ts',
  'src/trips/application/driver-stop-holiday-warning.port.ts',
  'src/trips/application/find-current-driver-trip.use-case.ts',
  'src/trips/infrastructure/drizzle-driver-stop-holiday-context.repository.ts',
] as const

async function listFiles(globs: readonly string[]): Promise<readonly string[]> {
  const files = new Set<string>()
  for (const pattern of globs) {
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd: APPLICATION_ROOT.pathname })) files.add(file)
  }

  return [...files].sort()
}

async function readSource(file: string): Promise<string> {
  return Bun.file(new URL(file, APPLICATION_ROOT)).text()
}

async function findFilesCiting(
  files: readonly string[],
  needles: readonly string[],
): Promise<readonly string[]> {
  const citing: string[] = []
  for (const file of files) {
    const source = await readSource(file)
    if (needles.some((needle) => source.includes(needle))) citing.push(file)
  }

  return citing
}

describe('spec 252 T4.3 — o feriado não toca o que mede o motorista (CA16)', () => {
  test('a lista vigiada acha os arquivos que importam', async () => {
    const files = await listFiles(SCORE_AND_PROOF_GLOBS)

    for (const known of KNOWN_SCORE_AND_PROOF_FILES) expect(files).toContain(known)
  })

  test('nenhum arquivo da nota, do comprovante ou da leitura cita o calendário nem o aviso', async () => {
    const files = await listFiles(SCORE_AND_PROOF_GLOBS)

    expect(await findFilesCiting(files, CALENDAR_NEEDLES)).toEqual([])
  })
})

describe('spec 252 T4.3 — o aviso do motorista não carrega o prazo da 236', () => {
  test('os arquivos do aviso do motorista existem', async () => {
    const files = await listFiles(DRIVER_WARNING_FILES)

    expect(files).toEqual([...DRIVER_WARNING_FILES].sort())
  })

  test('nenhum deles cita o prazo de entrega nem o suporte do aviso do detalhe', async () => {
    expect(await findFilesCiting(DRIVER_WARNING_FILES, DEADLINE_NEEDLES)).toEqual([])
  })

  test('o caso de uso é quem chama o módulo do aviso', async () => {
    const source = await readSource('src/trips/application/find-current-driver-trip.use-case.ts')

    expect(source).toContain('attachDriverStopHolidayWarnings')
  })
})
