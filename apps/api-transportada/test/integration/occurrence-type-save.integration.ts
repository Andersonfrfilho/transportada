/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Item 9 da lista da spec 183: o editor de tipos grava pela mesma função que o GET lê. Três
 * campos tardios — `redeliveryPolicy` (164), `attachmentMode` (179) e `emailsContractor` (183) —
 * têm de ir e voltar, e o UPDATE sem eles tem de preservá-los: antes, a política de reentrega
 * voltava para `unset` a cada edição do nome, e o GET nem a devolvia.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies } from '../../src/database/identity.schema.js'
import {
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

async function withDisposableDatabase(
  callback: (connectionString: string) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test database URL is required')

  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_occ_type_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''

  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    await callback(disposableUrl.toString())
  } finally {
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    } finally {
      await admin.close({ timeout: 0 })
    }
  }
}

describe('cadastro de tipo de ocorrência contra Postgres real', () => {
  testWithPostgres(
    'grava os campos tardios, o GET os devolve e o UPDATE sem eles não os zera',
    async () => {
      await withDisposableDatabase(async (connectionString) => {
        const provider = createDrizzleProvider({
          connection: { adapter: 'postgres', max: 1, url: connectionString },
        })

        try {
          const [company] = await provider.db
            .insert(companies)
            .values([{ status: 'active' }])
            .returning({ id: companies.id })
          if (company === undefined) throw new Error('Failed to seed company')

          const base = {
            active: true,
            allowsMultipleItems: true,
            companyId: company.id,
            emailBody: '',
            emailSubject: '',
            emailTemplateKey: null,
            notifies: false,
            stage: 'delivery' as const,
          }
          const created = await saveOccurrenceType(provider.db, {
            ...base,
            attachmentMode: 'required',
            emailsContractor: true,
            name: 'Recusa total',
            occurrenceTypeId: null,
            redeliveryPolicy: 'allowed',
          })

          await saveOccurrenceType(provider.db, {
            ...base,
            name: 'Recusa total pelo recebedor',
            occurrenceTypeId: created.id,
          })

          const [listed] = await listOccurrenceTypes(provider.db, { companyId: company.id })
          expect(listed).toMatchObject({
            attachmentMode: 'required',
            emailsContractor: true,
            id: created.id,
            name: 'Recusa total pelo recebedor',
            redeliveryPolicy: 'allowed',
          })

          await saveOccurrenceType(provider.db, {
            ...base,
            name: 'Recusa total pelo recebedor',
            occurrenceTypeId: created.id,
            redeliveryPolicy: 'blocked',
          })
          const [changed] = await listOccurrenceTypes(provider.db, { companyId: company.id })
          expect(changed?.redeliveryPolicy).toBe('blocked')
        } finally {
          await provider.close()
        }
      })
    },
    120_000,
  )
})
