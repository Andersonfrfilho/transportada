/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { TemplateRepository } from '@adatechnology/notification-module'
import { eq } from 'drizzle-orm'

import { companies } from '../src/database/database.schema.js'
import {
  parsePublishArguments,
  publishOccurrenceMailTemplates,
  readAddressCorrectionMailTemplateFile,
  readOccurrenceMailTemplateFiles,
  type PublicationPlan,
} from '../src/occurrence-conversation/application/occurrence-mail-templates-publish.service.js'

/**
 * Spec 272 T4.3 (ADR-0110 §13, D14): grava os modelos HTML do e-mail de ocorrência e o da correção de endereço (spec 286) no módulo de
 * notificação, uma versão nova por chave, nunca `UPDATE`. Sem `--confirm` só imprime o plano; `--confirm`
 * aplica só `create`; `differs` exige `--overwrite <chave>`. Em staging/produção é mudança de dados: pede
 * aprovação humana. Imprime só chaves, versões e o veredito.
 *
 *   bun run scripts/occurrence-mail-templates-publish.ts --company <uuid>
 *   bun run scripts/occurrence-mail-templates-publish.ts --company <uuid> --confirm [--overwrite <chave>]...
 */
async function main(): Promise<void> {
  const options = parsePublishArguments(process.argv.slice(2))

  const databaseUrl = process.env.DATABASE_URL ?? ''
  if (databaseUrl.length === 0) throw new Error('DATABASE_URL ausente')

  const provider = createDrizzleProvider({ connection: databaseUrl })
  try {
    const [company] = await provider.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, options.companyId))
      .limit(1)
    if (company === undefined) throw new Error('empresa não encontrada')

    const plan = await publishOccurrenceMailTemplates({
      companyId: options.companyId,
      confirm: options.confirm,
      overwrite: options.overwrite,
      repository: new TemplateRepository(provider.db as never),
      templates: [...readOccurrenceMailTemplateFiles(), readAddressCorrectionMailTemplateFile()],
    })

    process.stdout.write(formatPlan(plan, options.confirm))
    if (plan.invalid.length > 0) process.exitCode = 1
  } finally {
    await provider.close()
  }
}

function formatPlan(plan: PublicationPlan, confirm: boolean): string {
  if (plan.invalid.length > 0) {
    const lines = ['modelo inválido — nada foi gravado:']
    for (const item of plan.invalid) {
      lines.push(`  ${item.key}: ${item.problems.map((problem) => problem.code).join(', ')}`)
    }
    return `${lines.join('\n')}\n`
  }

  const lines = plan.entries.map((entry) => {
    const active = entry.activeVersion === null ? 'sem ativa' : `ativa v${entry.activeVersion}`
    const written = entry.writtenVersion === undefined ? '' : ` -> gravou v${entry.writtenVersion}`
    return `${entry.key.padEnd(34)} ${entry.verdict.padEnd(8)} ${active}${written}`
  })
  const footer = confirm
    ? 'aplicado. "differs" só foi gravado com --overwrite <chave>.'
    : 'nada foi gravado. repita com --confirm para aplicar os "create".'
  return `${lines.join('\n')}\n${footer}\n`
}

await main()
