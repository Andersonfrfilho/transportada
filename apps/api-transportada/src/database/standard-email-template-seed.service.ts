/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { parseEnvironment } from '../config/environment.schema.js'
import { createApiNotificationModule } from '../notification/infrastructure/notification-module.factory.js'
import { companies } from './identity.schema.js'

export type StandardEmailTemplateSeedResult = {
  readonly companies: number
  readonly written: number
}

type SeedStandardEmailTemplatesParams = {
  readonly ensureTemplate: (params: { readonly companyId: string }) => Promise<boolean>
  readonly listCompanyIds: () => Promise<readonly string[]>
}

/**
 * Spec 274 T3.9: cadastra a v1 do modelo padrão de e-mail (`notification.standard-email`) para toda
 * empresa. Em série, e `ensureTemplate` nunca sobrescreve versão que a empresa editou ou desativou —
 * `written` conta só o que esta passada criou.
 */
export async function seedStandardEmailTemplates({
  ensureTemplate,
  listCompanyIds,
}: SeedStandardEmailTemplatesParams): Promise<StandardEmailTemplateSeedResult> {
  const companyIds = await listCompanyIds()
  let written = 0
  for (const companyId of companyIds) {
    if (await ensureStandardEmailTemplate(ensureTemplate, { companyId })) written += 1
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
  ensureTemplate: SeedStandardEmailTemplatesParams['ensureTemplate'],
  params: { readonly companyId: string },
): Promise<boolean> {
  try {
    return await ensureTemplate(params)
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
    const module = createApiNotificationModule({ config, db: provider.db })

    return await seedStandardEmailTemplates({
      ensureTemplate: (params) => module.standardEmail.ensureTemplate(params),
      listCompanyIds: async () =>
        (await provider.db.select({ id: companies.id }).from(companies)).map((row) => row.id),
    })
  } finally {
    await provider.close()
  }
}
