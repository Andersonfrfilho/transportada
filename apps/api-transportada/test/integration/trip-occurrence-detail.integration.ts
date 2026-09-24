/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T202 (RF1/RF3), contra Postgres real: o detalhe da ocorrência é a linha da listagem — das
 * duas fontes — mais o motorista da viagem. Outra empresa não acha nada (nem a ocorrência, nem o
 * telefone do motorista); viagem sem motorista devolve `driver: null`; foto e WhatsApp só com
 * vínculo ativo e telefone verificado.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { fleetDrivers } from '../../src/database/fleet.schema.js'
import { identityUserPictures } from '../../src/database/identity-user-picture.schema.js'
import { userCompanyMemberships } from '../../src/database/identity.schema.js'
import {
  companyOccurrenceTypes,
  tripDrivers,
  tripStopOccurrences,
} from '../../src/database/trip.schema.js'
import { userWhatsAppPhones } from '../../src/database/user-whatsapp-phone.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { findTripOccurrenceDetail } from '../../src/trips/infrastructure/trip-occurrence-detail.query.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const PICTURE_TOKEN = 'A'.repeat(43)
const DRIVER_PHONE = '11999990001'
const WHATSAPP_PHONE = '5511999990001'

async function registerDocumentOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<string> {
  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id: occurrenceTypeId,
    name: 'Caixa violada',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'separation',
  })
  const occurrence = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      items: [],
      note: 'caixa com avaria visível',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'blocked',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Caixa violada',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (occurrence === null) throw new Error('EXPECTED_OCCURRENCE')
  return occurrence.id
}

async function registerStopOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripStopOccurrences).values({
    actorUserId: company.userId,
    channel: 'driver_app',
    companyId: company.companyId,
    createdAt: new Date('2026-09-22T13:00:00.000Z'),
    description: 'doca fechada',
    id,
    kind: 'dock_closed',
    stopId: trip.stopId,
  })
  return id
}

/** A ficha do primeiro motorista preenchida, com vínculo ativo, foto publicada e WhatsApp verificado. */
async function completeFirstDriver(database: TestDatabase, company: Company): Promise<string> {
  await database.db
    .update(fleetDrivers)
    .set({
      email: 'motorista.um@example.test',
      phone: DRIVER_PHONE,
    })
    .where(eq(fleetDrivers.id, company.firstDriverId))
  const userId = await linkDriverMembership(database, company, company.firstDriverId)
  await database.db.insert(identityUserPictures).values({
    byteSize: JPEG_BYTES.byteLength,
    contentBase64: Buffer.from(JPEG_BYTES).toString('base64'),
    mimeType: 'image/jpeg',
    publicToken: PICTURE_TOKEN,
    sha256: '0'.repeat(64),
    userId,
  })
  await database.db
    .insert(userWhatsAppPhones)
    .values({ phone: WHATSAPP_PHONE, userId, verifiedAt: new Date('2026-09-01T00:00:00.000Z') })
  return userId
}

describe('o detalhe da ocorrência (spec 183 T202)', () => {
  testWithPostgres(
    'ocorrência de nota: a mesma linha da listagem, mais o motorista completo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await completeFirstDriver(database, company)
        const occurrenceId = await registerDocumentOccurrence(database, company, trip)

        const detail = await findTripOccurrenceDetail(database.db, {
          companyId: company.companyId,
          occurrenceId,
        })
        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        const feedItem = page.items.find((item) => item.id === occurrenceId)
        if (detail === null || feedItem === undefined) throw new Error('EXPECTED_DETAIL')

        const { driver, ...line } = detail
        expect(line).toEqual(feedItem)
        expect(detail.source).toBe('document')
        expect(detail.case).toMatchObject({ status: 'recorded' })
        expect(driver).toEqual({
          driverId: company.firstDriverId,
          email: 'motorista.um@example.test',
          name: 'Motorista Um',
          phone: DRIVER_PHONE,
          picturePath: `/public/company-users/${PICTURE_TOKEN}/picture`,
          whatsappPhone: WHATSAPP_PHONE,
        })
      })
    },
  )

  testWithPostgres('ocorrência de parada: a outra fonte, sem tratativa', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await registerStopOccurrence(database, company, trip)

      const detail = await findTripOccurrenceDetail(database.db, {
        companyId: company.companyId,
        occurrenceId,
      })

      expect(detail).toMatchObject({
        case: null,
        description: 'doca fechada',
        id: occurrenceId,
        source: 'stop',
        tripId: trip.tripId,
      })
      /** Ficha sem vínculo, sem foto e sem WhatsApp: vazio do jeito que a ficha grava, nunca inventado. */
      expect(detail?.driver).toEqual({
        driverId: company.firstDriverId,
        email: '',
        name: 'Motorista Um',
        phone: '',
        picturePath: null,
        whatsappPhone: null,
      })
    })
  })

  testWithPostgres('outra empresa não acha a ocorrência — nem de nota, nem de parada', async () => {
    await withDisposableDatabase(async (database) => {
      const owner = await seedCompany(database)
      const trip = await seedTrip(database, owner, 'in_transit')
      await completeFirstDriver(database, owner)
      const documentOccurrenceId = await registerDocumentOccurrence(database, owner, trip)
      const stopOccurrenceId = await registerStopOccurrence(database, owner, trip)
      const intruder = await seedCompany(database)

      for (const occurrenceId of [documentOccurrenceId, stopOccurrenceId]) {
        expect(
          await findTripOccurrenceDetail(database.db, {
            companyId: intruder.companyId,
            occurrenceId,
          }),
        ).toBeNull()
      }
      expect(
        await findTripOccurrenceDetail(database.db, {
          companyId: owner.companyId,
          occurrenceId: crypto.randomUUID(),
        }),
      ).toBeNull()
    })
  })

  testWithPostgres('viagem sem motorista pareado devolve driver: null', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await registerStopOccurrence(database, company, trip)
      await database.db
        .delete(tripDrivers)
        .where(
          and(eq(tripDrivers.companyId, company.companyId), eq(tripDrivers.tripId, trip.tripId)),
        )

      const detail = await findTripOccurrenceDetail(database.db, {
        companyId: company.companyId,
        occurrenceId,
      })

      expect(detail?.driverName).toBe('')
      expect(detail?.driver).toBeNull()
    })
  })

  testWithPostgres(
    'vínculo encerrado e telefone não verificado não expõem foto nem WhatsApp',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const userId = await completeFirstDriver(database, company)
        await database.db
          .update(userWhatsAppPhones)
          .set({ verifiedAt: null })
          .where(eq(userWhatsAppPhones.userId, userId))
        await database.db
          .update(userCompanyMemberships)
          .set({ status: 'disabled' })
          .where(eq(userCompanyMemberships.userId, userId))
        const occurrenceId = await registerStopOccurrence(database, company, trip)

        const detail = await findTripOccurrenceDetail(database.db, {
          companyId: company.companyId,
          occurrenceId,
        })

        expect(detail?.driver).toMatchObject({
          phone: DRIVER_PHONE,
          picturePath: null,
          whatsappPhone: null,
        })
      })
    },
  )
})
