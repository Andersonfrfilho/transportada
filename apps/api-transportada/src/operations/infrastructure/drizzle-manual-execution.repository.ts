/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { jobExecutions } from '../../database/database.schema.js'
import type { ManualExecutionRepository } from '../application/run-job.port.js'

export type ManualExecutionDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleManualExecutionRepository(
  database: ManualExecutionDatabase,
): ManualExecutionRepository {
  return {
    async release(input) {
      /**
       * Apagar, não fechar: a linha nunca chegou a rodar. Marcá-la como encerrada poria no painel
       * uma execução que não existiu, e o operador leria isso como "rodou e não fez nada".
       */
      await database.delete(jobExecutions).where(eq(jobExecutions.id, input.executionId))
    },

    async startManual(input) {
      /**
       * `onConflictDoNothing` sobre `job_executions_open_unique`: é o índice que decide, e é por
       * isso que **não** há `select` antes. Entre ler "não há execução aberta" e inserir cabe outra
       * escrita, e o botão apertado duas vezes no mesmo segundo criaria duas.
       *
       * O CHECK `job_executions_requester_check` exige `requested_by` e `company_id` juntos quando a
       * origem é manual — o banco recusa uma execução manual anônima.
       */
      const inserted = await database
        .insert(jobExecutions)
        .values({
          companyId: input.companyId,
          correlationId: input.correlationId,
          counters: {},
          job: input.job,
          origin: 'manual',
          requestedBy: input.requestedBy,
          startedAt: sql`now()`,
        })
        .onConflictDoNothing()
        .returning({ id: jobExecutions.id })

      const executionId = inserted[0]?.id

      return executionId === undefined ? null : { executionId }
    },
  }
}
