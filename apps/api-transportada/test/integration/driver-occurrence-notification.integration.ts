/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 275, contra Postgres real: a ocorrência que o motorista registra numa nota, pelo caminho real
 * (`registerDriverOccurrence` + repositórios Drizzle + leitor do aviso + `sendNotification` do módulo), grava o aviso
 * em `notification.notifications` para os responsáveis e quem despachou — sem duplicar, com o tipo `notifies = false`.
 */
import { describe, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  companyOccurrenceWatchers,
  identityUserProfiles,
  identityUsers,
  membershipPermissions,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createApiNotificationModule } from '../../src/notification/infrastructure/notification-module.factory.js'
import { NOTIFICATION_DEFAULT_LOCALE } from '../../src/notification/notification.constant.js'
import { createDriverOccurrenceNotifier } from '../../src/trips/application/driver-occurrence-notifier.service.js'
import { createDriverOccurrenceNotificationReader } from '../../src/trips/infrastructure/driver-occurrence-notification.query.js'
import {
  withNotificationDatabase,
  seedNotificationTemplate,
} from '../fixtures/notification-template.fixture.js'
import {
  registerStreetOccurrence,
  seedConfirmedUpload,
} from '../fixtures/street-occurrence-registration.fixture.js'
import {
  databaseUrl,
  seedCompany,
  seedDeliveryOccurrenceType,
  seedDispatchSnapshot,
  seedTrip,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const testWithPostgres = databaseUrl === undefined ? test.skip : test
const TEMPLATE_KEY = 'trip.delivery-occurrence'
const TEST_TIMEOUT_MS = 120_000
const CONFIG = {
  cryptography: { notificationSuppressionHmacKey: 'test-suppression-hmac-key-0123456789' },
  emailChannelEnabled: false,
} as never

type World = { readonly company: Company; readonly trip: SeededTrip; readonly typeId: string }

async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedDispatchSnapshot(database, company, trip, new Date('2026-10-19T08:00:00.000Z'))
  await seedProfile(database, company.userId)
  const typeId = await seedDeliveryOccurrenceType(database, company)
  /** D1: o aviso do motorista não olha a flag do escritório. */
  await database.db
    .update(companyOccurrenceTypes)
    .set({ notifies: false })
    .where(eq(companyOccurrenceTypes.id, typeId))
  await seedNotificationTemplate(database, {
    body: 'A nota {{documentLabel}} teve uma ocorrência: {{occurrenceType}} ({{stopLabel}}).',
    channel: 'inbox',
    companyId: company.companyId,
    key: TEMPLATE_KEY,
    subject: null,
  })
  return { company, trip, typeId }
}

/** O perfil com e-mail: o módulo resolve o endereço do destinatário (o despachante também tem um). */
async function seedProfile(database: TestDatabase, userId: string) {
  await database.db.insert(identityUserProfiles).values({
    contactAddress: `${userId.slice(0, 8)}@exemplo.com.br`,
    contactChannel: 'email',
    name: `Usuário ${userId.slice(0, 4)}`,
    userId,
    username: userId,
  })
}

/** Um responsável da empresa: vínculo ativo, `occurrences.resolve` e e-mail (a lista efetiva da 267 RF3). */
async function seedCompanyWatcher(database: TestDatabase, company: Company, userId: string) {
  const exists = await database.db
    .select({ id: identityUsers.id })
    .from(identityUsers)
    .where(eq(identityUsers.id, userId))
  let membershipId: string
  if (exists.length === 0) {
    membershipId = crypto.randomUUID()
    await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
    await database.db
      .insert(userCompanyMemberships)
      .values({ companyId: company.companyId, id: membershipId, status: 'active', userId })
    await seedProfile(database, userId)
  } else {
    const [membership] = await database.db
      .select({ id: userCompanyMemberships.id })
      .from(userCompanyMemberships)
      .where(eq(userCompanyMemberships.userId, userId))
    if (membership === undefined) throw new Error('Seeded membership vanished')
    membershipId = membership.id
  }
  await database.db.insert(membershipPermissions).values({
    grantedByUserId: company.userId,
    membershipId,
    permission: 'occurrences.resolve',
  })
  await database.db.insert(companyOccurrenceWatchers).values({
    companyId: company.companyId,
    createdByUserId: company.userId,
    status: 'active',
    updatedByUserId: company.userId,
    userId,
  })
}

async function registerWithNotifier(database: TestDatabase, world: World) {
  const notifications = createApiNotificationModule({ config: CONFIG, db: database.db })
  const warnings: string[] = []
  const notifier = createDriverOccurrenceNotifier({
    logger: { warn: (event) => void warnings.push(event) },
    reader: createDriverOccurrenceNotificationReader(database.db),
    send: (params) =>
      notifications.useCases.sendNotification.execute({
        ...params,
        locale: NOTIFICATION_DEFAULT_LOCALE,
      } as never),
  })
  const attachmentObjectId = await seedConfirmedUpload(database, world)
  const saved = await registerStreetOccurrence(database, {
    ...world,
    attachmentObjectId,
    notifier,
  })
  return { saved, warnings }
}

async function notifiedUsers(database: TestDatabase, companyId: string) {
  const rows = (await database.db.execute(sql`
    select recipient_user_id, template_key, dedupe_key from notification.notifications
    where company_id = ${companyId}::uuid order by recipient_user_id`)) as unknown as readonly {
    readonly dedupe_key: string
    readonly recipient_user_id: string
    readonly template_key: string
  }[]
  return rows
}

describe('o aviso da ocorrência do motorista chega ao painel (spec 275, Postgres)', () => {
  testWithPostgres(
    'responsável da empresa e quem despachou recebem um aviso cada; tipo notifies = false',
    async () => {
      await withNotificationDatabase(async (database) => {
        const world = await seedWorld(database)
        const ana = crypto.randomUUID()
        await seedCompanyWatcher(database, world.company, ana)

        const { saved, warnings } = await registerWithNotifier(database, world)

        const rows = await notifiedUsers(database, world.company.companyId)
        expect(warnings).toEqual([])
        expect(rows.map((row) => row.recipient_user_id).sort()).toEqual(
          [ana, world.company.userId].sort(),
        )
        expect(rows.every((row) => row.template_key === TEMPLATE_KEY)).toBe(true)
        expect(rows.map((row) => row.dedupe_key).sort()).toEqual(
          [ana, world.company.userId].map((user) => `${TEMPLATE_KEY}:${saved.id}:${user}`).sort(),
        )
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'quem despachou e também é responsável recebe um só; sem lista, só quem despachou',
    async () => {
      await withNotificationDatabase(async (database) => {
        const listed = await seedWorld(database)
        await seedCompanyWatcher(database, listed.company, listed.company.userId)
        expect((await registerWithNotifier(database, listed)).warnings).toEqual([])
        expect(
          (await notifiedUsers(database, listed.company.companyId)).map(
            (row) => row.recipient_user_id,
          ),
        ).toEqual([listed.company.userId])

        const bare = await seedWorld(database)
        expect((await registerWithNotifier(database, bare)).warnings).toEqual([])
        expect(
          (await notifiedUsers(database, bare.company.companyId)).map(
            (row) => row.recipient_user_id,
          ),
        ).toEqual([bare.company.userId])
      })
    },
    TEST_TIMEOUT_MS,
  )
})
