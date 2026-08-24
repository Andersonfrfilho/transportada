/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNull, or } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { jobExecutions } from '../../database/job-schedule.schema.js'
import { nfeDistributionCursors } from '../../database/nfe.schema.js'
import type {
  JobRunSnapshot,
  LastJobRunReaderPort,
  NfeDistributionCursorSnapshot,
  NfeDistributionStatusReaderPort,
  NfeFiscalEnvironment,
} from '../application/nfe-import.types.js'
import type { ScheduledJob } from '../../shared/job-catalog.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfeDistributionStatusRepository
  implements LastJobRunReaderPort, NfeDistributionStatusReaderPort
{
  public constructor(private readonly database: Database) {}

  async read(input: { readonly companyId: string }): Promise<{
    readonly cursor: NfeDistributionCursorSnapshot
    readonly environment: NfeFiscalEnvironment
  } | null> {
    const [profile] = await this.database
      .select({ environment: companyFiscalProfiles.environment })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)
    if (profile === undefined) return null

    const [cursor] = await this.database
      .select({
        leaseExpiresAt: nfeDistributionCursors.leaseExpiresAt,
        maxNsu: nfeDistributionCursors.maxNsu,
        nextAllowedAt: nfeDistributionCursors.nextAllowedAt,
        ultNsu: nfeDistributionCursors.ultNsu,
        updatedAt: nfeDistributionCursors.updatedAt,
      })
      .from(nfeDistributionCursors)
      .where(
        and(
          eq(nfeDistributionCursors.companyId, input.companyId),
          eq(nfeDistributionCursors.environment, profile.environment),
        ),
      )
      .limit(1)

    return {
      cursor:
        cursor === undefined
          ? null
          : {
              leaseExpiresAt: cursor.leaseExpiresAt?.toISOString() ?? null,
              maxNsu: cursor.maxNsu,
              nextAllowedAt: cursor.nextAllowedAt?.toISOString() ?? null,
              ultNsu: cursor.ultNsu,
              updatedAt: cursor.updatedAt.toISOString(),
            },
      environment: profile.environment,
    }
  }

  /**
   * O ciclo agendado não tem empresa — a cadência é da instalação —, e o clique tem a de quem
   * clicou. Ler as duas é o que faz o cartão contar a mesma história das duas origens; ler a linha
   * manual de **outra** empresa contaria à instalação vizinha que alguém ali apertou o botão.
   */
  async readLastRun(input: {
    readonly companyId: string
    readonly job: ScheduledJob
  }): Promise<JobRunSnapshot | null> {
    const [run] = await this.database
      .select({
        counters: jobExecutions.counters,
        finishedAt: jobExecutions.finishedAt,
        origin: jobExecutions.origin,
        outcome: jobExecutions.outcome,
        startedAt: jobExecutions.startedAt,
      })
      .from(jobExecutions)
      .where(
        and(
          eq(jobExecutions.job, input.job),
          or(isNull(jobExecutions.companyId), eq(jobExecutions.companyId, input.companyId)),
        ),
      )
      .orderBy(desc(jobExecutions.startedAt))
      .limit(1)
    if (run === undefined) return null
    return {
      counters: run.counters as Readonly<Record<string, number>>,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      origin: run.origin,
      outcome: run.outcome,
      startedAt: run.startedAt.toISOString(),
    }
  }
}
