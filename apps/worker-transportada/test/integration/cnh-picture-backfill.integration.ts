/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: quem é "pendente" é um `JOIN` de cinco tabelas e um `NOT EXISTS`; só o banco de
 * verdade o executa. As tabelas nascem aqui com as colunas que o SQL usa (a paridade de nomes com a
 * migration da API é de `test/cnh-face/backfill.contract.ts`).
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runCnhPictureBackfill } from '../../src/cnh-face/application/cnh-picture-backfill.service.js'
import { createDrizzleCnhPictureBackfillRepository } from '../../src/cnh-face/infrastructure/drizzle-cnh-picture-backfill.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeIntegration = databaseUrl === undefined ? describe.skip : describe

describeIntegration('pendentes do backfill da foto da CNH, contra Postgres', () => {
  let admin: SQL
  let database: ReturnType<typeof createDrizzleProvider>
  let databaseName: string
  const companyId = crypto.randomUUID()

  async function seedDriver(input: {
    readonly hasIdentity?: boolean
    readonly hasPicture?: boolean
    readonly pictureOrigin?: string
    readonly picturePublished?: boolean
    readonly linked: boolean
    readonly objectStatus?: string
    readonly type?: string
  }): Promise<string> {
    const userId = crypto.randomUUID()
    const membershipId = crypto.randomUUID()
    const driverId = crypto.randomUUID()
    const attachmentId = crypto.randomUUID()
    const objectId = crypto.randomUUID()
    await database.db.execute(`
      insert into user_company_memberships (id, company_id, user_id) values ('${membershipId}', '${companyId}', '${userId}');
      insert into fleet_drivers (id, company_id, membership_id) values ('${driverId}', '${companyId}', ${input.linked ? `'${membershipId}'` : 'null'});
      insert into stored_objects (id, company_id, bucket, object_key, status) values ('${objectId}', '${companyId}', 'bucket', 'key-${attachmentId}', '${input.objectStatus ?? 'final'}');
      insert into fleet_driver_attachments (id, company_id, driver_id, type, stored_object_id) values ('${attachmentId}', '${companyId}', '${driverId}', '${input.type ?? 'cnh'}', '${objectId}');
      ${input.hasPicture === true ? `insert into identity_user_pictures (user_id, origin, published_at) values ('${userId}', '${input.pictureOrigin ?? 'admin'}', ${input.picturePublished === true ? 'now()' : 'null'});` : ''}
      ${input.hasIdentity === true ? `insert into external_identities (user_id, subject) values ('${userId}', 'subject-${userId}');` : ''}
    `)
    return attachmentId
  }

  beforeAll(async () => {
    admin = new SQL(databaseUrl as string, { max: 1 })
    databaseName = `transportada_cnhpic_${crypto.randomUUID().replaceAll('-', '')}`
    await admin.unsafe(`create database "${databaseName}"`)
    const disposableUrl = new URL(databaseUrl as string)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await database.db.execute(`
      create table user_company_memberships (id uuid primary key, company_id uuid not null, user_id uuid not null);
      create table fleet_drivers (id uuid primary key, company_id uuid not null, membership_id uuid);
      create table stored_objects (id uuid primary key, company_id uuid not null, bucket text not null, object_key text not null, status text not null);
      create table fleet_driver_attachments (id uuid primary key, company_id uuid not null, driver_id uuid not null, type text not null, stored_object_id uuid not null);
      create table identity_user_pictures (user_id uuid primary key, origin text not null default 'admin', published_at timestamptz);
      create table external_identities (user_id uuid not null, subject text not null);
    `)
  })

  afterAll(async () => {
    await database?.close().catch(() => undefined)
    await admin
      .unsafe(`drop database if exists "${databaseName}" with (force)`)
      .catch(() => undefined)
    await admin.close({ timeout: 0 })
  })

  test('lista só CNH final de motorista com usuário e sem foto, em lotes por chave', async () => {
    const pending = [
      await seedDriver({ linked: true }),
      await seedDriver({ linked: true }),
      await seedDriver({ linked: true }),
    ]
    await seedDriver({ hasPicture: true, linked: true })
    await seedDriver({ linked: false })
    await seedDriver({ linked: true, type: 'address_proof' })
    await seedDriver({ linked: true, objectStatus: 'deleted' })
    const source = createDrizzleCnhPictureBackfillRepository(database.db)

    const result = await runCnhPictureBackfill({ batchSize: 2, mode: 'dry-run', source })
    const firstPage = await source.listPending({ limit: 2 })
    const secondPage = await source.listPending({
      afterAttachmentId: firstPage.at(-1)?.attachmentId as string,
      limit: 2,
    })

    expect(result.candidates).toBe(3)
    expect([...firstPage, ...secondPage].map((entry) => entry.attachmentId).sort()).toEqual(
      [...pending].sort(),
    )
    expect(firstPage[0]).toMatchObject({ bucket: 'bucket', companyId })
  })

  test('foto da CNH ainda não publicada no provedor volta à lista só se o usuário já tem conta lá', async () => {
    const source = createDrizzleCnhPictureBackfillRepository(database.db)
    const before = new Set((await source.listPending({ limit: 100 })).map((e) => e.attachmentId))
    const republish = await seedDriver({
      hasIdentity: true,
      hasPicture: true,
      linked: true,
      pictureOrigin: 'cnh',
    })
    const noAccount = await seedDriver({ hasPicture: true, linked: true, pictureOrigin: 'cnh' })
    const published = await seedDriver({
      hasIdentity: true,
      hasPicture: true,
      linked: true,
      pictureOrigin: 'cnh',
      picturePublished: true,
    })
    const adminPicture = await seedDriver({ hasIdentity: true, hasPicture: true, linked: true })

    const listed = new Set((await source.listPending({ limit: 100 })).map((e) => e.attachmentId))

    expect(listed.has(republish)).toBe(true)
    for (const excluded of [noAccount, published, adminPicture]) {
      expect(listed.has(excluded)).toBe(false)
    }
    expect(before.has(republish)).toBe(false)
  })
})
