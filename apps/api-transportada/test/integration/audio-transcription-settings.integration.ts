/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.4 (contract.md §5.1), contra Postgres real: a decisão da empresa sobre a transcrição dos áudios.
 * Sem linha a empresa está ligada; só a mudança de valor grava e audita (ator, empresa, antes/depois, correlação, IP,
 * na mesma transação); `updated_at` e `enabled_since` vêm do relógio do banco; dois `PUT` simultâneos auditam uma vez;
 * a linha criada pela rotina não conta como decisão de pessoa.
 */
import { describe, expect } from 'bun:test'
import { asc, eq, sql } from 'drizzle-orm'

import { DrizzleAudioTranscriptionSettingsRepository } from '../../src/companies/infrastructure/drizzle-audio-transcription-settings.repository.js'
import { auditLogs, companyAudioTranscriptionSettings } from '../../src/database/database.schema.js'
import { withConversationDatabase } from '../fixtures/occurrence-conversation-database.fixture.js'
import { seedCompany, testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const IP_ADDRESS = '203.0.113.7'
const CHANGED_ACTION = 'company-audio-transcription.changed'

const actorOf = (company: Company, correlationId: string) => ({
  companyId: company.companyId,
  correlationId,
  ipAddress: IP_ADDRESS,
  userId: company.userId,
})

async function readAudits(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId))
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
}

async function readRow(database: TestDatabase, companyId: string) {
  const [row] = await database.db
    .select()
    .from(companyAudioTranscriptionSettings)
    .where(eq(companyAudioTranscriptionSettings.companyId, companyId))
  return row
}

async function databaseNowSeconds(database: TestDatabase): Promise<number> {
  const [row] = await database.db.execute<{ readonly seconds: string }>(
    sql`select extract(epoch from now())::text as seconds`,
  )
  return Number(row?.seconds)
}

describe('audio transcription settings repository integration (spec 264 T2.4)', () => {
  testWithPostgres(
    'sem linha está ligada e um PUT igual não grava nem audita; desligar grava com o relógio do banco',
    async () => {
      await withConversationDatabase(async (database) => {
        const company = await seedCompany(database)
        const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)
        expect(await repository.find({ companyId: company.companyId })).toEqual({
          enabled: true,
          updatedAt: null,
        })

        const unchanged = await repository.save({
          ...actorOf(company, 'corr-same'),
          enabled: true,
        })
        expect(unchanged).toEqual({ enabled: true, updatedAt: null })
        expect(await readRow(database, company.companyId)).toBeUndefined()
        expect(await readAudits(database, company.companyId)).toHaveLength(0)

        const disabled = await repository.save({
          ...actorOf(company, 'corr-disable'),
          enabled: false,
        })
        expect(disabled.enabled).toBe(false)
        expect(disabled.updatedAt).not.toBeNull()
        const nowSeconds = await databaseNowSeconds(database)
        expect(Math.abs(nowSeconds - (disabled.updatedAt?.getTime() ?? 0) / 1000)).toBeLessThan(60)

        const row = await readRow(database, company.companyId)
        expect(row).toMatchObject({ enabled: false, updatedByUserId: company.userId })
        expect(row?.routineStartedAt).toBeNull()
        const [audit, ...rest] = await readAudits(database, company.companyId)
        expect(rest).toHaveLength(0)
        expect(audit).toMatchObject({
          action: CHANGED_ACTION,
          actorUserId: company.userId,
          afterSnapshot: { enabled: false },
          beforeSnapshot: { enabled: true },
          companyId: company.companyId,
          correlationId: 'corr-disable',
          entityId: company.companyId,
          metadata: { ipAddress: IP_ADDRESS },
          permission: 'settings.manage',
          targetId: company.companyId,
        })
      })
    },
    240_000,
  )

  testWithPostgres(
    'repetir o valor não escreve nem audita; religar audita de novo e renova o marco enabled_since',
    async () => {
      await withConversationDatabase(async (database) => {
        const company = await seedCompany(database)
        const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)
        await repository.save({ ...actorOf(company, 'corr-1'), enabled: false })
        const afterDisable = await readRow(database, company.companyId)

        await repository.save({ ...actorOf(company, 'corr-2'), enabled: false })
        const afterRepeat = await readRow(database, company.companyId)
        expect(afterRepeat?.updatedAt.getTime()).toBe(afterDisable?.updatedAt.getTime())
        expect(await readAudits(database, company.companyId)).toHaveLength(1)

        await repository.save({ ...actorOf(company, 'corr-3'), enabled: true })
        const afterEnable = await readRow(database, company.companyId)
        expect(afterEnable?.enabled).toBe(true)
        expect(afterEnable?.enabledSince.getTime()).toBeGreaterThan(
          afterDisable?.enabledSince.getTime() ?? 0,
        )
        expect(afterEnable?.updatedAt.getTime()).toBeGreaterThan(
          afterDisable?.updatedAt.getTime() ?? 0,
        )
        const audits = await readAudits(database, company.companyId)
        expect(audits.map((audit) => audit.correlationId)).toEqual(['corr-1', 'corr-3'])
        expect(audits[1]).toMatchObject({
          afterSnapshot: { enabled: true },
          beforeSnapshot: { enabled: false },
        })
      })
    },
    240_000,
  )

  testWithPostgres(
    'dois PUT simultâneos na primeira escrita auditam uma vez só',
    async () => {
      await withConversationDatabase(async (database) => {
        const company = await seedCompany(database)
        const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)
        await Promise.all([
          repository.save({ ...actorOf(company, 'corr-a'), enabled: false }),
          repository.save({ ...actorOf(company, 'corr-b'), enabled: false }),
        ])
        expect(await readAudits(database, company.companyId)).toHaveLength(1)
        expect((await readRow(database, company.companyId))?.enabled).toBe(false)
      })
    },
    240_000,
  )

  testWithPostgres(
    'a linha criada pela rotina não é decisão de pessoa (updatedAt nulo) e desligar audita contra ligada; outra empresa fica intacta',
    async () => {
      await withConversationDatabase(async (database) => {
        const company = await seedCompany(database)
        const other = await seedCompany(database)
        await database.db
          .insert(companyAudioTranscriptionSettings)
          .values([{ companyId: company.companyId }, { companyId: other.companyId }])
        const repository = new DrizzleAudioTranscriptionSettingsRepository(database.db)
        expect(await repository.find({ companyId: company.companyId })).toEqual({
          enabled: true,
          updatedAt: null,
        })

        const unchanged = await repository.save({ ...actorOf(company, 'corr-same'), enabled: true })
        expect(unchanged).toEqual({ enabled: true, updatedAt: null })
        expect(await readAudits(database, company.companyId)).toHaveLength(0)

        await repository.save({ ...actorOf(company, 'corr-off'), enabled: false })
        const [audit] = await readAudits(database, company.companyId)
        expect(audit).toMatchObject({
          afterSnapshot: { enabled: false },
          beforeSnapshot: { enabled: true },
        })
        expect(await repository.find({ companyId: other.companyId })).toEqual({
          enabled: true,
          updatedAt: null,
        })
        expect(await readAudits(database, other.companyId)).toHaveLength(0)
        expect((await readRow(database, other.companyId))?.enabled).toBe(true)
      })
    },
    240_000,
  )
})
