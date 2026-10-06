/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.3b e T2.3 (CA04, CA03, RF6), contra Postgres real:
 *
 * 1. **Comportamento da CA04.** Um tipo com foto `required` gravado **antes** das colunas novas continua
 *    exigindo a observação depois da migration — `TRIP_OCCURRENCE_NOTE_REQUIRED` no registro. O
 *    `UPDATE` da migration, lido do disco, é o que leva a regra do código para o dado; tirá-lo deixa
 *    este teste vermelho (mutação registrada em `evidence.md`).
 * 2. **A exceção da nota vale no servidor**, pelo caminho real: o contratante e o destinatário saem da
 *    nota no banco (`findDriverReachableDocument`), e a exigência é a resolvida campo a campo.
 */
import { join } from 'node:path'

import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { nfeParticipants } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
  companyOccurrenceTypes,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import {
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceItemsRequiredError,
  TripOccurrenceNoteRequiredError,
} from '../../src/trips/domain/trip.error.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import {
  registerStreetOccurrence,
  seedConfirmedUpload,
} from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedExtraDocument,
  seedTrip,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261006205139_occurrence_type_requirement_modes/',
  import.meta.url,
)
const EMITTER_TAX_ID = '30290856000160'
const RECIPIENT_TAX_ID = '12345678000190'
const OTHER_RECIPIENT_TAX_ID = '98765432000110'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('a observação obrigatória sobrevive à migration (spec 246 T2.3b, CA04)', () => {
  testWithPostgres(
    'tipo com foto required gravado antes das colunas novas: sem nota, NOTE_REQUIRED',
    async () => {
      if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
      await withDisposableDatabaseLifecycle({
        adminUrl: databaseUrl,
        namePrefix: 'transportada_reqreg',
        migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
        open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
        operation: async (database, connectionString) => {
          const raw = new SQL(connectionString, { max: 1 })
          try {
            const rollback = await Bun.file(
              join(MIGRATION_DIRECTORY.pathname, 'rollback.sql'),
            ).text()
            await raw.unsafe(rollback)

            const company = await seedCompany(database)
            const trip = await seedTrip(database, company, 'in_transit')
            const typeId = crypto.randomUUID()
            await raw`
              insert into company_occurrence_types (id, company_id, name, stage, attachment_mode)
              values (${typeId}, ${company.companyId}, 'Recusa total', 'delivery', 'required')
            `
            await runDatabaseMigrations({ connectionString })

            const uploadId = await seedConfirmedUpload(database, { company, trip })
            const withoutNote = await rejection(
              registerStreetOccurrence(database, {
                attachmentObjectId: uploadId,
                company,
                note: '',
                trip,
                typeId,
              }),
            )
            const withNote = await registerStreetOccurrence(database, {
              attachmentObjectId: uploadId,
              company,
              note: 'cliente recusou o volume',
              trip,
              typeId,
            })

            expect(withoutNote).toBeInstanceOf(TripOccurrenceNoteRequiredError)
            expect((withoutNote as TripOccurrenceNoteRequiredError).code).toBe(
              'TRIP_OCCURRENCE_NOTE_REQUIRED',
            )
            expect(withNote.id).toBeString()
          } finally {
            await raw.close()
          }
        },
      })
    },
    60_000,
  )
})

type World = {
  readonly company: Company
  readonly firstDocument: string
  readonly secondDocument: string
  readonly trip: SeededTrip
}

async function seedParticipants(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly documentId: string
    readonly recipientTaxId: string
  },
): Promise<void> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, input.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  await database.db.insert(nfeParticipants).values([
    {
      companyId: input.company.companyId,
      documentId: row.nfeDocumentId,
      role: 'emitter',
      taxId: EMITTER_TAX_ID,
    },
    {
      companyId: input.company.companyId,
      documentId: row.nfeDocumentId,
      legalName: 'Destinatário',
      role: 'recipient',
      taxId: input.recipientTaxId,
    },
  ])
}

/** Duas notas do mesmo emitente (o contratante) para destinatários diferentes. */
async function seedWorld(
  database: TestDatabase,
): Promise<World & { readonly contractorId: string }> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const secondDocument = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
    stopId: trip.stopId,
  })
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
  for (const taxId of [RECIPIENT_TAX_ID, OTHER_RECIPIENT_TAX_ID]) {
    await database.db.insert(deliveryClients).values({ companyId: company.companyId, taxId })
  }
  await seedParticipants(database, {
    company,
    documentId: trip.documentId,
    recipientTaxId: RECIPIENT_TAX_ID,
  })
  await seedParticipants(database, {
    company,
    documentId: secondDocument,
    recipientTaxId: OTHER_RECIPIENT_TAX_ID,
  })
  return { company, contractorId, firstDocument: trip.documentId, secondDocument, trip }
}

async function seedType(
  database: TestDatabase,
  input: {
    readonly attachmentMode: 'off' | 'optional' | 'required'
    readonly company: Company
    readonly noteMode: 'off' | 'optional' | 'required'
  },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    attachmentMode: input.attachmentMode,
    companyId: input.company.companyId,
    id,
    name: `Tipo ${id.slice(0, 4)}`,
    noteMode: input.noteMode,
    stage: 'delivery',
  })
  return id
}

describe('a exceção da nota vale no registro, pelo caminho real (spec 246 T2.3, CA03, RF6)', () => {
  testWithPostgres(
    'destinatário mais estrito endurece; outro destinatário volta ao tipo; contratante afrouxa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const scope = { company: world.company, trip: world.trip }
        const hardType = await seedType(database, {
          attachmentMode: 'optional',
          company: world.company,
          noteMode: 'optional',
        })
        await database.db.insert(companyOccurrenceTypeRecipientOverrides).values({
          attachmentMode: 'required',
          companyId: world.company.companyId,
          noteMode: 'required',
          occurrenceTypeId: hardType,
          taxId: RECIPIENT_TAX_ID,
        })
        const upload = await seedConfirmedUpload(database, scope)
        const register = (input: {
          documentId: string
          photo: boolean
          note: string
          typeId: string
        }) =>
          registerStreetOccurrence(database, {
            ...scope,
            attachmentObjectId: input.photo ? upload : null,
            documentId: input.documentId,
            note: input.note,
            typeId: input.typeId,
          })

        // O destinatário da nota 1 exige foto e observação; o tipo, sozinho, não exige nada.
        expect(
          await rejection(
            register({
              documentId: world.firstDocument,
              note: 'x',
              photo: false,
              typeId: hardType,
            }),
          ),
        ).toBeInstanceOf(TripOccurrenceAttachmentRequiredError)
        expect(
          await rejection(
            register({ documentId: world.firstDocument, note: '', photo: true, typeId: hardType }),
          ),
        ).toBeInstanceOf(TripOccurrenceNoteRequiredError)
        // A nota 2, de outro destinatário, no mesmo tipo: volta ao que o tipo pede (nada).
        expect(
          (
            await register({
              documentId: world.secondDocument,
              note: '',
              photo: false,
              typeId: hardType,
            })
          ).id,
        ).toBeString()

        // Tipo obrigatório que o contratante afrouxa: sem foto nem nota, grava.
        const looseType = await seedType(database, {
          attachmentMode: 'required',
          company: world.company,
          noteMode: 'required',
        })
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'optional',
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          noteMode: 'optional',
          occurrenceTypeId: looseType,
        })
        expect(
          (
            await register({
              documentId: world.secondDocument,
              note: '',
              photo: false,
              typeId: looseType,
            })
          ).id,
        ).toBeString()

        // Destinatário vence contratante, campo a campo: a foto vem do destinatário (required), a
        // observação — nula no destinatário — herda a do contratante (optional), não a do tipo.
        await database.db.insert(companyOccurrenceTypeRecipientOverrides).values({
          attachmentMode: 'required',
          companyId: world.company.companyId,
          occurrenceTypeId: looseType,
          taxId: RECIPIENT_TAX_ID,
        })
        expect(
          await rejection(
            register({
              documentId: world.firstDocument,
              note: '',
              photo: false,
              typeId: looseType,
            }),
          ),
        ).toBeInstanceOf(TripOccurrenceAttachmentRequiredError)
        expect(
          (
            await register({
              documentId: world.firstDocument,
              note: '',
              photo: true,
              typeId: looseType,
            })
          ).id,
        ).toBeString()
      })
    },
    60_000,
  )
})

describe('produtos obrigatórios pelo caminho real (spec 246 T2.4b)', () => {
  testWithPostgres('nota sem item algum não satisfaz produtos obrigatórios', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const typeId = crypto.randomUUID()
      await database.db.insert(companyOccurrenceTypes).values({
        companyId: company.companyId,
        id: typeId,
        itemsMinimumCount: null,
        itemsMode: 'required',
        name: 'Recusa total',
        stage: 'delivery',
      })

      const error = await rejection(
        registerStreetOccurrence(database, { attachmentObjectId: null, company, trip, typeId }),
      )

      expect(error).toBeInstanceOf(TripOccurrenceItemsRequiredError)
      expect((error as TripOccurrenceItemsRequiredError).code).toBe(
        'TRIP_OCCURRENCE_ITEMS_REQUIRED',
      )
    })
  })
})
