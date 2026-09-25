/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T203 (RF2), contra Postgres real: a listagem de ocorrências mostra de quem é a carga,
 * para onde ia e quanto vale — o bloco `document`.
 *
 * - valor: `nfe_documents.total_value`, `numeric`, **string decimal** (nunca `number`);
 * - contratante: o **emitente** da nota, casado com `contractors` pelo CNPJ dentro da empresa (a
 *   mesma regra de `findChargeParties`, 143 RF3); sem cadastro, o nome do emitente e `contractorId`
 *   nulo;
 * - endereço: o **destino físico** (`listStopAddresses` → `resolvePhysicalDestination`, spec 073):
 *   `<entrega>` vence `<enderDest>` — é onde o caminhão para, não o cadastro do cliente;
 * - ocorrência de parada sem nota: `document: null`;
 * - sem N+1: uma página com uma ocorrência e uma com várias fazem o mesmo número de consultas.
 */
import { describe, expect } from 'bun:test'

import { contractors } from '../../src/database/delivery-client.schema.js'
import { nfeAddresses, nfeParticipants } from '../../src/database/nfe.schema.js'
import { tripStopOccurrences } from '../../src/database/trip.schema.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import {
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
import { tripDocuments } from '../../src/database/trip.schema.js'
import { and, eq } from 'drizzle-orm'

const EMITTER_TAX_ID = '11222333000181'

async function nfeDocumentIdOf(database: TestDatabase, trip: SeededTrip): Promise<string> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  if (row?.nfeDocumentId === null || row?.nfeDocumentId === undefined) {
    throw new Error('EXPECTED_NFE_DOCUMENT')
  }
  return row.nfeDocumentId
}

async function seedParticipant(
  database: TestDatabase,
  company: Company,
  input: {
    readonly address?: {
      readonly city: string
      readonly cityCode: string
      readonly number: string
      readonly postalCode: string
      readonly state: string
      readonly street: string
    }
    readonly documentId: string
    readonly legalName: string
    readonly role: string
    readonly taxId: string
  },
): Promise<void> {
  const participantId = crypto.randomUUID()
  await database.db.insert(nfeParticipants).values({
    companyId: company.companyId,
    documentId: input.documentId,
    id: participantId,
    legalName: input.legalName,
    role: input.role,
    taxId: input.taxId,
    tradeName: input.legalName,
  })
  if (input.address !== undefined) {
    await database.db.insert(nfeAddresses).values({
      ...input.address,
      companyId: company.companyId,
      participantId,
    })
  }
}

/** Emitente cadastrado como contratante; destinatário e local de entrega com endereços diferentes. */
async function seedDocumentParties(
  database: TestDatabase,
  company: Company,
  nfeDocumentId: string,
): Promise<string> {
  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'Contratante Alfa',
    id: contractorId,
    taxId: EMITTER_TAX_ID,
  })
  await seedParticipant(database, company, {
    documentId: nfeDocumentId,
    legalName: 'Contratante Alfa Indústria Ltda',
    role: 'emitter',
    taxId: EMITTER_TAX_ID,
  })
  await seedParticipant(database, company, {
    address: {
      city: 'São Paulo',
      cityCode: '3550308',
      number: '10',
      postalCode: '01001000',
      state: 'SP',
      street: 'Rua do Cadastro',
    },
    documentId: nfeDocumentId,
    legalName: 'Destinatário Beta',
    role: 'recipient',
    taxId: '99888777000166',
  })
  await seedParticipant(database, company, {
    address: {
      city: 'Guarulhos',
      cityCode: '3518800',
      number: '500',
      postalCode: '07000000',
      state: 'SP',
      street: 'Avenida da Doca',
    },
    documentId: nfeDocumentId,
    legalName: 'Galpão de entrega',
    role: 'delivery',
    taxId: '99888777000166',
  })
  return contractorId
}

async function insertStopOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  withDocument: boolean,
  createdAt: Date,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(tripStopOccurrences).values({
    actorUserId: company.userId,
    channel: 'driver_app',
    companyId: company.companyId,
    createdAt,
    description: 'doca fechada',
    id,
    kind: 'dock_closed',
    stopId: trip.stopId,
    ...(withDocument ? { tripDocumentId: trip.documentId } : {}),
  })
  return id
}

function countingDatabase(db: TestDatabase['db']): {
  readonly database: TestDatabase['db']
  readonly selectCount: () => number
} {
  let count = 0
  const database = new Proxy(db, {
    get(target, property, receiver) {
      if (property === 'select' || property === 'selectDistinct') count += 1
      return Reflect.get(target, property, receiver)
    },
  })
  return { database, selectCount: () => count }
}

describe('a listagem mostra a nota da ocorrência (spec 183 T203)', () => {
  testWithPostgres(
    'valor em string decimal, contratante pelo emitente e o destino físico da entrega',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const nfeDocumentId = await nfeDocumentIdOf(database, trip)
        const contractorId = await seedDocumentParties(database, company, nfeDocumentId)
        const occurrenceId = await insertStopOccurrence(
          database,
          company,
          trip,
          true,
          new Date('2026-09-22T12:00:00.000Z'),
        )

        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        const item = page.items.find((candidate) => candidate.id === occurrenceId)

        expect(item?.document).toEqual({
          contractor: {
            contractorId,
            name: 'Contratante Alfa',
            taxId: EMITTER_TAX_ID,
          },
          destination: {
            city: 'Guarulhos',
            label: expect.stringContaining('Avenida da Doca') as unknown as string,
            origin: 'delivery',
            postalCode: '07000000',
            recipientName: 'Galpão de entrega',
            state: 'SP',
          },
          nfeDocumentId,
          totalValue: '10000.0000',
          /** Spec 183 T702d: a foto da conversa vira anexo da ocorrência pela nota da viagem. */
          tripDocumentId: trip.documentId,
        })
      })
    },
  )

  testWithPostgres(
    'emitente sem cadastro de contratante: o nome do emitente e contractorId nulo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const nfeDocumentId = await nfeDocumentIdOf(database, trip)
        await seedParticipant(database, company, {
          documentId: nfeDocumentId,
          legalName: 'Emitente Sem Cadastro Ltda',
          role: 'emitter',
          taxId: '55444333000122',
        })
        const occurrenceId = await insertStopOccurrence(
          database,
          company,
          trip,
          true,
          new Date('2026-09-22T12:00:00.000Z'),
        )

        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        const item = page.items.find((candidate) => candidate.id === occurrenceId)

        expect(item?.document?.contractor).toEqual({
          contractorId: null,
          name: 'Emitente Sem Cadastro Ltda',
          taxId: '55444333000122',
        })
        expect(item?.document?.destination).toBeNull()
      })
    },
  )

  testWithPostgres('ocorrência de parada sem nota: document nulo', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const occurrenceId = await insertStopOccurrence(
        database,
        company,
        trip,
        false,
        new Date('2026-09-22T12:00:00.000Z'),
      )

      const page = await listTripOccurrenceFeed(database.db, {
        companyId: company.companyId,
        cursor: null,
        limit: 20,
        order: 'desc',
      })

      expect(page.items.find((candidate) => candidate.id === occurrenceId)?.document).toBeNull()
    })
  })

  testWithPostgres(
    'o contratante de outra empresa com o mesmo CNPJ não é casado (tenant em cada junção)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const other = await seedCompany(database)
        await database.db.insert(contractors).values({
          companyId: other.companyId,
          displayName: 'Contratante de outra empresa',
          taxId: EMITTER_TAX_ID,
        })
        const trip = await seedTrip(database, company, 'in_transit')
        const nfeDocumentId = await nfeDocumentIdOf(database, trip)
        await seedParticipant(database, company, {
          documentId: nfeDocumentId,
          legalName: 'Emitente da própria empresa',
          role: 'emitter',
          taxId: EMITTER_TAX_ID,
        })
        const occurrenceId = await insertStopOccurrence(
          database,
          company,
          trip,
          true,
          new Date('2026-09-22T12:00:00.000Z'),
        )

        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })

        expect(
          page.items.find((candidate) => candidate.id === occurrenceId)?.document?.contractor,
        ).toEqual({
          contractorId: null,
          name: 'Emitente da própria empresa',
          taxId: EMITTER_TAX_ID,
        })
      })
    },
  )

  testWithPostgres('sem N+1: uma ocorrência ou vinte, o mesmo número de consultas', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const firstTrip = await seedTrip(database, company, 'in_transit')
      await seedDocumentParties(database, company, await nfeDocumentIdOf(database, firstTrip))
      await insertStopOccurrence(
        database,
        company,
        firstTrip,
        true,
        new Date('2026-09-22T12:00:00.000Z'),
      )

      const single = countingDatabase(database.db)
      await listTripOccurrenceFeed(single.database, {
        companyId: company.companyId,
        cursor: null,
        limit: 25,
        order: 'desc',
      })

      for (let index = 0; index < 19; index += 1) {
        const trip = await seedTrip(database, company, 'in_transit')
        await insertStopOccurrence(
          database,
          company,
          trip,
          true,
          new Date(Date.UTC(2026, 8, 22, 13, index)),
        )
      }
      const many = countingDatabase(database.db)
      const page = await listTripOccurrenceFeed(many.database, {
        companyId: company.companyId,
        cursor: null,
        limit: 25,
        order: 'desc',
      })

      expect(page.items).toHaveLength(20)
      expect(many.selectCount()).toBe(single.selectCount())
    })
  })

  /** Guarda de sanidade do próprio teste: a junção do fixture é pela empresa. */
  testWithPostgres('o fixture liga a nota à viagem da empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const [row] = await database.db
        .select({ id: tripDocuments.id })
        .from(tripDocuments)
        .where(
          and(
            eq(tripDocuments.companyId, company.companyId),
            eq(tripDocuments.id, trip.documentId),
          ),
        )
      expect(row?.id).toBe(trip.documentId)
    })
  })
})
