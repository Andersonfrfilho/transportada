import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { migrationsDirectory } from './support.js'

const RNTRC_MIGRATION_SUFFIX = '_rntrc_registry_leading_zero'
const REFUSAL_MESSAGE = 'Refusing to roll back the RNTRC registry'

export type RntrcRollbackProbe = {
  readonly database: SQL
  readonly directories: readonly string[]
}

/**
 * Estreitar o cadastro de volta para oito posições reescreveria documento fiscal por conta própria:
 * o rollback recusa enquanto houver registro de nove, e quem opera encurta antes de rodá-lo.
 */
export async function assertRntrcRollbackRefusesNinePositions(
  probe: RntrcRollbackProbe,
): Promise<void> {
  const directory = probe.directories.find((name) => name.endsWith(RNTRC_MIGRATION_SUFFIX))
  if (directory === undefined) {
    throw new Error('RNTRC registry migration is required')
  }

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  let refusal: unknown
  try {
    await probe.database.unsafe(rollback)
  } catch (error) {
    refusal = error
  }
  // O script aborta na primeira exceção e o COMMIT nunca chega a rodar: a conexão fica presa
  // na transação abortada e recusa qualquer comando até que alguém a encerre.
  await probe.database.unsafe('ROLLBACK')

  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(REFUSAL_MESSAGE)

  await probe.database`update company_fiscal_profiles set rntrc = '58151044' where length(rntrc) = 9`
  await probe.database`update fleet_vehicles set owner_rntrc = '58151044' where length(owner_rntrc) = 9`
}
