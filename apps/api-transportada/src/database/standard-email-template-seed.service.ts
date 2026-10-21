/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { parseEnvironment } from '../config/environment.schema.js'
import { createApiNotificationModule } from '../notification/infrastructure/notification-module.factory.js'
import { companies } from './identity.schema.js'

export type StandardEmailTemplateSeedResult = {
  readonly companies: number
  readonly written: number
}

type Database = ReturnType<typeof createDrizzleProvider>['db']

type SeedStandardEmailTemplatesParams = {
  /** `db` é a transação que segura o lock da empresa: o módulo de notificação tem de gravar por ela. */
  readonly ensureTemplate: (params: {
    readonly companyId: string
    readonly db: Database
  }) => Promise<boolean>
  readonly database: Database
  readonly listCompanyIds: () => Promise<readonly string[]>
}

/**
 * Spec 274 T3.9: cadastra a v1 do modelo padrão de e-mail (`notification.standard-email`) para toda
 * empresa. Em série, e `ensureTemplate` nunca sobrescreve versão que a empresa editou ou desativou —
 * `written` conta só o que esta passada criou.
 */
export async function seedStandardEmailTemplates({
  database,
  ensureTemplate,
  listCompanyIds,
}: SeedStandardEmailTemplatesParams): Promise<StandardEmailTemplateSeedResult> {
  const companyIds = await listCompanyIds()
  let written = 0
  for (const companyId of companyIds) {
    if (await ensureStandardEmailTemplate(database, ensureTemplate, { companyId })) written += 1
  }

  return { companies: companyIds.length, written }
}

type PostgresErrorShape = {
  readonly cause?: PostgresErrorShape
  readonly code?: string
  readonly errno?: string
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as PostgresErrorShape | null | undefined
  const matches = (shape: PostgresErrorShape | undefined): boolean =>
    shape?.code === '23505' || shape?.errno === '23505'

  return matches(candidate ?? undefined) || matches(candidate?.cause)
}

/**
 * O driver do Bun expõe o SQLSTATE em `errno` (com `code: 'ERR_POSTGRES_SERVER_ERROR'`). O SDK 0.2.2 já trata `errno`;
 * mantemos o tratamento aqui como defesa em profundidade (sem teste que prove a corrida): perder a corrida pela v1 é "já existe".
 */
export async function ensureStandardEmailTemplate(
  database: Database,
  ensureTemplate: SeedStandardEmailTemplatesParams['ensureTemplate'],
  params: { readonly companyId: string },
): Promise<boolean> {
  try {
    // `ensureTemplate` do SDK faz `existsIdentity` e depois `upsert` (max(version)+1): duas chamadas
    // concorrentes gravam v1 e v2 sem conflito de unicidade. O lock transacional por empresa as serializa.
    return await database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`notification.standard-email:${params.companyId}`}, 0))`,
      )

      return ensureTemplate({ ...params, db: transaction as unknown as Database })
    })
  } catch (error) {
    if (isUniqueViolation(error)) return false
    throw error
  }
}

/** Monta o módulo de notificação com uma conexão própria, fechada ao fim da passada. */
export async function seedStandardEmailTemplatesFromEnvironment(
  config: ReturnType<typeof parseEnvironment>,
): Promise<StandardEmailTemplateSeedResult> {
  const provider = createDrizzleProvider({
    connection: { adapter: 'postgres', max: 1, url: config.databaseUrl },
  })
  try {
    return await seedStandardEmailTemplates({
      database: provider.db,
      ensureTemplate: ({ companyId, db }) =>
        createApiNotificationModule({ config, db }).standardEmail.ensureTemplate({ companyId }),
      listCompanyIds: async () =>
        (await provider.db.select({ id: companies.id }).from(companies)).map((row) => row.id),
    })
  } finally {
    await provider.close()
  }
}
