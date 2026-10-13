/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: cenários do retorno da contratante para o teste manual no ambiente LOCAL. Cria, na empresa
 * do usuário local (`db:seed:local`), uma ocorrência de nota por cenário, cada uma no estado do retorno
 * que o roteiro `specs/248-*\/roteiro-de-teste.md` pede. Tudo leva o prefixo `[TESTE 248]`.
 *
 *   DATABASE_URL=postgresql://... bun run scripts/seed-contractor-reply-scenarios.ts
 *   ... --reset             apaga só o que este script criou
 *   ... --reset --seed      apaga e cria de novo
 *   ... --company <uuid>    outra empresa em que o usuário local tenha vínculo ativo
 *
 * Idempotente: um cenário cujo tipo já existe é pulado. Recusa qualquer banco fora de localhost.
 */
import { SQL } from 'bun'
import { and, eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../src/database/database-client.service.js'
import { companyOccurrenceTypes } from '../src/database/database.schema.js'
import {
  assertLocalDatabase,
  countAllTables,
  parseScenarioArguments,
  printCountDelta,
  resolveSeedTarget,
} from './contractor-reply-scenarios/scenario-environment.js'
import { SCENARIO_PREFIX } from './contractor-reply-scenarios/scenario.constant.js'
import { SCENARIOS, seedScenario } from './contractor-reply-scenarios/scenario-catalog.js'
import {
  ensureContractor,
  ensureMailSettings,
} from './contractor-reply-scenarios/scenario-fixtures.js'
import type {
  ScenarioContext,
  ScenarioDatabase,
} from './contractor-reply-scenarios/scenario-fixtures.js'
import { resetScenarios } from './contractor-reply-scenarios/scenario-reset.js'

async function seedAll(context: ScenarioContext): Promise<void> {
  await ensureMailSettings(context.database, context.companyId)
  let nextSequence = 1
  for (const definition of SCENARIOS) {
    const sequence = nextSequence
    nextSequence += definition.notes.length
    const [existing] = await context.database.db
      .select({ id: companyOccurrenceTypes.id })
      .from(companyOccurrenceTypes)
      .where(
        and(
          eq(companyOccurrenceTypes.companyId, context.companyId),
          eq(companyOccurrenceTypes.name, definition.type.name),
        ),
      )
    if (existing !== undefined) {
      console.info(`= já existe: ${definition.type.name}`)
      continue
    }
    const opened = await seedScenario(context, definition, sequence)
    console.info(`+ ${definition.type.name} (${opened} ocorrência(s)): ${definition.shows}`)
  }
}

async function main(): Promise<void> {
  const options = parseScenarioArguments(process.argv.slice(2))
  const databaseUrl = assertLocalDatabase(process.env.DATABASE_URL)
  const sql = new SQL(databaseUrl, { max: 1 })
  const provider = createDatabaseProvider({
    pool: { connectTimeoutSeconds: 10, max: 5, queryTimeoutMs: 30_000 },
    url: databaseUrl,
  })
  try {
    const target = await resolveSeedTarget(sql, options.companyId)
    const before = await countAllTables(sql)
    if (options.isReset) {
      const statements = await resetScenarios(sql, target.companyId)
      console.info(`reset: ${statements} comando(s) de exclusão`)
      printCountDelta('Linhas removidas (negativo = removidas):', before, await countAllTables(sql))
    }
    if (options.shouldSeed) {
      const database = provider as unknown as ScenarioDatabase
      const baseline = await countAllTables(sql)
      const contractorId = await ensureContractor(database, target.companyId)
      await seedAll({ ...target, contractorId, database })
      printCountDelta(`Linhas criadas (${SCENARIO_PREFIX}):`, baseline, await countAllTables(sql))
    }
  } finally {
    await provider.close()
    await sql.close()
  }
}

await main()
