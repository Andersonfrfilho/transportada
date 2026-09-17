/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 D10: o provider de storage não tem `list`, então o extrato do catálogo só é descoberto
 * porque existe uma linha aqui. Esta linha é também a única trilha de auditoria da recarga — a API
 * não tem tabela de auditoria de uso geral —, e é por isso que o rollback recusa com qualquer
 * conteúdo dentro.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { expectQueryToFail, migrationsDirectory } from './support.js'

const TOLL_BOOTH_EXTRACT_MIGRATION_SUFFIX = '_toll_booth_extracts'
const REFUSAL_MESSAGE = 'toll_booth_extracts has rows, refusing rollback'

const DATASET = 'sudeste'
const OBSERVED_ON = '2026-09-14'
const OBJECT_KEY = 'toll-booths/osm/sudeste/2026-09-14/toll-booths.json'
const SHA256 = 'a'.repeat(64)

export type TollBoothExtractProbe = {
  readonly database: SQL
  readonly directories: readonly string[]
}

async function assertNoForeignKeyLeavesTheTable(database: SQL): Promise<void> {
  // A tabela não tem tenant, e uma FK para `identity_users` lhe daria a primeira aresta de saída
  // para o grafo da identidade — justamente o que `tenant-safety.contract.ts` afirma não existir.
  const constraints = await database<Array<{ readonly constraint_type: string }>>`
    select constraint_type
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'toll_booth_extracts'
      and constraint_type = 'FOREIGN KEY'
  `
  expect(constraints).toEqual([])

  const columns = await database<Array<{ readonly column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'toll_booth_extracts'
    order by column_name
  `
  expect(columns.map((column) => column.column_name)).not.toContain('company_id')
}

async function assertRollbackRefusesTheAuditTrail(probe: TollBoothExtractProbe): Promise<void> {
  const directory = probe.directories.find((name) =>
    name.endsWith(TOLL_BOOTH_EXTRACT_MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('Toll booth extract migration is required')

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  let refusal: unknown
  try {
    await probe.database.unsafe(rollback)
  } catch (error) {
    refusal = error
  }
  // O script aborta na primeira exceção e o COMMIT nunca roda: a conexão fica presa na transação
  // abortada e recusa qualquer comando até que alguém a encerre.
  await probe.database.unsafe('ROLLBACK')

  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(REFUSAL_MESSAGE)
}

export async function assertTollBoothExtractConstraints(
  probe: TollBoothExtractProbe,
): Promise<void> {
  const { database } = probe
  const uploadedByUserId = crypto.randomUUID()

  await assertNoForeignKeyLeavesTheTable(database)

  // Medido em staging: 592 praças, 579 com alguma tarifa, 571 com tarifa por eixo.
  await database`
    insert into toll_booth_extracts (
      dataset, observed_on, object_key, sha256,
      booth_count, booths_with_charge, booths_with_axle_charge,
      source_url, extracted_at, uploaded_by_user_id
    )
    values (
      ${DATASET}, ${OBSERVED_ON}, ${OBJECT_KEY}, ${SHA256},
      592, 579, 571,
      'https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf',
      '2026-09-15T00:12:00Z', ${uploadedByUserId}
    )
  `

  // O 409 do aceite 8 é desta chave: o `put` do bucket responde `replayed` para os mesmos bytes e
  // nunca é o que reprova o duplicado.
  await expectQueryToFail(
    database`
      insert into toll_booth_extracts (
        dataset, observed_on, object_key, sha256,
        booth_count, booths_with_charge, booths_with_axle_charge, uploaded_by_user_id
      )
      values (
        ${DATASET}, ${OBSERVED_ON}, ${OBJECT_KEY}, ${'b'.repeat(64)},
        592, 579, 571, ${uploadedByUserId}
      )
    `,
    '23505',
    'toll_booth_extracts_pkey',
  )

  const rejections = [
    // O dataset entra na chave do objeto: sem esta forma, `..` no nome sai do prefixo do bucket.
    { constraint: 'toll_booth_extracts_dataset_check', row: { dataset: '../escapado' } },
    { constraint: 'toll_booth_extracts_object_key_check', row: { objectKey: 'qualquer/coisa' } },
    { constraint: 'toll_booth_extracts_sha256_check', row: { sha256: 'A'.repeat(64) } },
    // Extrato de zero praça é falha do extrator, não catálogo vazio.
    { constraint: 'toll_booth_extracts_counts_check', row: { boothCount: 0 } },
    // Ter tarifa por eixo implica ter tarifa.
    { constraint: 'toll_booth_extracts_counts_check', row: { boothsWithAxleCharge: 580 } },
    { constraint: 'toll_booth_extracts_source_url_check', row: { sourceUrl: 'http://inseguro' } },
  ] as const

  for (const [index, rejection] of rejections.entries()) {
    const row = {
      dataset: DATASET,
      objectKey: OBJECT_KEY,
      sha256: SHA256,
      boothCount: 592,
      boothsWithCharge: 579,
      boothsWithAxleCharge: 571,
      sourceUrl: null as string | null,
      ...rejection.row,
    }
    await expectQueryToFail(
      database`
        insert into toll_booth_extracts (
          dataset, observed_on, object_key, sha256,
          booth_count, booths_with_charge, booths_with_axle_charge,
          source_url, uploaded_by_user_id
        )
        values (
          ${row.dataset}, ${`2026-08-${String(index + 10)}`}, ${row.objectKey}, ${row.sha256},
          ${row.boothCount}, ${row.boothsWithCharge}, ${row.boothsWithAxleCharge},
          ${row.sourceUrl}, ${uploadedByUserId}
        )
      `,
      '23514',
      rejection.constraint,
    )
  }

  // Recarga é ator + data + contagem, ou nada: meia trilha não é trilha.
  await expectQueryToFail(
    database`
      update toll_booth_extracts
      set reloaded_at = now()
      where dataset = ${DATASET} and observed_on = ${OBSERVED_ON}
    `,
    '23514',
    'toll_booth_extracts_reload_check',
  )
  await database`
    update toll_booth_extracts
    set reloaded_at = now(), reloaded_by_user_id = ${uploadedByUserId}, reloaded_booth_count = 592
    where dataset = ${DATASET} and observed_on = ${OBSERVED_ON}
  `

  await assertRollbackRefusesTheAuditTrail(probe)
  await database`delete from toll_booth_extracts`
}
