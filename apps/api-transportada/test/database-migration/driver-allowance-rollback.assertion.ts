/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143: a diária combinada, o número de diárias da viagem e o valor geral da empresa são
 * decisão de dinheiro que ninguém reconstrói do histórico — o rollback recusa enquanto houver
 * qualquer uma delas gravada, e quem opera esvazia antes de rodá-lo.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { migrationsDirectory } from './support.js'

const DRIVER_ALLOWANCE_MIGRATION_SUFFIX = '_driver_daily_allowance'

const DRIVER_REFUSAL_MESSAGE =
  'fleet_drivers has rows with daily_allowance_amount set, refusing rollback'
const TRIP_REFUSAL_MESSAGE = 'trips has rows with daily_allowance_days set, refusing rollback'
const SETTINGS_REFUSAL_MESSAGE = 'company_driver_allowance_settings has rows, refusing rollback'

export type DriverAllowanceRollbackProbe = {
  readonly database: SQL
  readonly directories: readonly string[]
}

async function expectRollbackRefusal(
  database: SQL,
  rollback: string,
  message: string,
): Promise<void> {
  let refusal: unknown
  try {
    await database.unsafe(rollback)
  } catch (error) {
    refusal = error
  }
  // O script aborta na primeira exceção e o COMMIT nunca chega a rodar: a conexão fica presa
  // na transação abortada e recusa qualquer comando até que alguém a encerre.
  await database.unsafe('ROLLBACK')

  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(message)
}

export async function assertDriverAllowanceRollbackRefusesRecordedMoney(
  probe: DriverAllowanceRollbackProbe,
): Promise<void> {
  const directory = probe.directories.find((name) =>
    name.endsWith(DRIVER_ALLOWANCE_MIGRATION_SUFFIX),
  )
  if (directory === undefined) {
    throw new Error('Driver daily allowance migration is required')
  }

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  // As três guardas param em sequência, então cada uma só aparece depois que a anterior é esvaziada.
  await expectRollbackRefusal(probe.database, rollback, DRIVER_REFUSAL_MESSAGE)
  await probe.database`update fleet_drivers set daily_allowance_amount = null where daily_allowance_amount is not null`

  await expectRollbackRefusal(probe.database, rollback, TRIP_REFUSAL_MESSAGE)
  await probe.database`update trips set daily_allowance_days = null where daily_allowance_days is not null`

  await expectRollbackRefusal(probe.database, rollback, SETTINGS_REFUSAL_MESSAGE)
  await probe.database`delete from company_driver_allowance_settings`
}
