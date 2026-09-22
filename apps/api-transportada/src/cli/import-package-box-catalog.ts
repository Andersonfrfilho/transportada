#!/usr/bin/env bun
/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162, RF08 — lê o JSONL da captura de catálogo (spec 161) do stdin e importa as medidas.
 * Simulação por padrão (transação com `ROLLBACK`, P4); `--apply` grava (dentro de uma única
 * transação, RNF01). Relatório em JSON no stdout — sem PII, só GTIN, `companyId` opaco e contagens
 * (RNF02). Roda dentro do serviço `api` (`railway ssh`), nunca direto contra o Postgres público
 * (RNF03) — ver `scripts/box-catalog-harvest/import-to-production.sh`.
 *
 * Uso: `bun src/cli/import-package-box-catalog.ts [--apply] < box-catalog-harvest.jsonl`
 */
import { z } from 'zod'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createImportPackageBoxCatalog } from '../nfe-documents/application/import-package-box-catalog.use-case.js'
import { DrizzlePackageBoxCatalogImportRepository } from '../nfe-documents/infrastructure/drizzle-package-box-catalog-import.repository.js'

const cliEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1).startsWith('postgres', 'DATABASE_URL must use PostgreSQL'),
})

async function readStdinLines(): Promise<readonly string[]> {
  const text = await Bun.stdin.text()
  return text.split('\n').filter((line) => line.trim().length > 0)
}

export async function runImportPackageBoxCatalogCli(argv: readonly string[]): Promise<void> {
  const apply = argv.includes('--apply')
  const environment = cliEnvironmentSchema.parse({ DATABASE_URL: process.env.DATABASE_URL })
  const lines = await readStdinLines()

  const database = createDrizzleProvider({ connection: environment.DATABASE_URL })
  try {
    const importUseCase = createImportPackageBoxCatalog({
      repository: new DrizzlePackageBoxCatalogImportRepository(database.db),
    })
    const report = await importUseCase.execute({ apply, lines })
    console.log(JSON.stringify(report, undefined, 2))
  } finally {
    await database.close()
  }
}

if (import.meta.main) {
  await runImportPackageBoxCatalogCli(process.argv.slice(2))
}
