/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T4.3 (ADR-0110 §13, D14): o publicador dos modelos contra um Postgres de verdade — o
 * `TemplateRepository` do módulo de notificação é quem grava, então só a base prova `max(version)+1`.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { TemplateRepository } from '@adatechnology/notification-module'

import { withNotificationDatabase as withDisposableDatabase } from '../fixtures/notification-template.fixture.js'
import { companies } from '../../src/database/database.schema.js'
import {
  OCCURRENCE_MAIL_TEMPLATE_CHANNEL,
  OCCURRENCE_MAIL_TEMPLATE_LOCALE,
  publishOccurrenceMailTemplates,
  readOccurrenceMailTemplateFiles,
} from '../../src/occurrence-conversation/application/occurrence-mail-templates-publish.service.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const KEYS = [
  'ocorrencia.avaria',
  'ocorrencia.devolucao',
  'ocorrencia.devolucao-total',
  'ocorrencia.entrega-nao-realizada',
  'ocorrencia.prorrogacao-boleto',
  'ocorrencia.recusa',
]

async function activeVersions(
  repository: TemplateRepository,
  companyId: string,
): Promise<Record<string, number | undefined>> {
  const result: Record<string, number | undefined> = {}
  for (const key of KEYS) {
    const row = await repository.findActive({
      channel: OCCURRENCE_MAIL_TEMPLATE_CHANNEL,
      companyId,
      key,
      locale: OCCURRENCE_MAIL_TEMPLATE_LOCALE,
    })
    result[key] = row?.version as number | undefined
  }
  return result
}

async function setup(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  const repository = new TemplateRepository(database.db as never)
  const run = (options: {
    confirm: boolean
    overwrite?: string[]
    templates?: ReturnType<typeof readOccurrenceMailTemplateFiles>
  }) =>
    publishOccurrenceMailTemplates({
      companyId,
      confirm: options.confirm,
      overwrite: options.overwrite ?? [],
      repository: repository as never,
      templates: options.templates ?? readOccurrenceMailTemplateFiles(),
    })
  return { companyId, repository, run }
}

describe('publicar os modelos do e-mail de ocorrência (spec 272 T4.3)', () => {
  testWithPostgres(
    'dry-run não grava; --confirm grava a versão 1; a segunda rodada não grava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, repository, run } = await setup(database)

        const dry = await run({ confirm: false })
        expect(dry.entries.map((entry) => entry.verdict)).toEqual(Array(KEYS.length).fill('create'))
        expect(Object.values(await activeVersions(repository, companyId))).toEqual(
          Array(KEYS.length).fill(undefined),
        )

        await run({ confirm: true })
        expect(Object.values(await activeVersions(repository, companyId))).toEqual(
          Array(KEYS.length).fill(1),
        )

        const second = await run({ confirm: true })
        expect(second.entries.map((entry) => entry.verdict)).toEqual(
          Array(KEYS.length).fill('same'),
        )
        expect(Object.values(await activeVersions(repository, companyId))).toEqual(
          Array(KEYS.length).fill(1),
        )
      })
    },
  )

  testWithPostgres('arquivo inválido não grava nenhuma chave', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, repository, run } = await setup(database)
      const files = readOccurrenceMailTemplateFiles()
      const templates = files.map((file) =>
        file.key === 'ocorrencia.recusa'
          ? {
              ...file,
              body: file.body.replace('<!-- mensagem -->', '<script>x</script><!-- mensagem -->'),
            }
          : file,
      )

      const report = await run({ confirm: true, templates })

      expect(report.invalid.map((item) => item.key)).toEqual(['ocorrencia.recusa'])
      expect(Object.values(await activeVersions(repository, companyId))).toEqual(
        Array(KEYS.length).fill(undefined),
      )
    })
  })

  testWithPostgres(
    'differs sem --overwrite não grava; com --overwrite grava só aquela chave',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, repository, run } = await setup(database)
        await run({ confirm: true })
        await repository.upsert({
          active: true,
          body: '<p>personalizado</p>\n<!-- mensagem -->\n{{mensagem}}\n<!-- /mensagem -->\n',
          channel: OCCURRENCE_MAIL_TEMPLATE_CHANNEL,
          companyId,
          key: 'ocorrencia.avaria',
          locale: OCCURRENCE_MAIL_TEMPLATE_LOCALE,
          subject: 'personalizado',
        })

        const without = await run({ confirm: true })
        expect(without.entries.find((entry) => entry.key === 'ocorrencia.avaria')?.verdict).toBe(
          'differs',
        )
        expect((await activeVersions(repository, companyId))['ocorrencia.avaria']).toBe(2)

        await run({ confirm: true, overwrite: ['ocorrencia.avaria'] })
        const versions = await activeVersions(repository, companyId)
        expect(versions['ocorrencia.avaria']).toBe(3)
        expect(versions['ocorrencia.recusa']).toBe(1)
      })
    },
  )
})
