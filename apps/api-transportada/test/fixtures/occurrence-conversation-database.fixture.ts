/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183: o cenário da conversa com a contratante contra Postgres — empresa com e-mail
 * verificado, a nota cujo emitente é contratante, três contatos (o terceiro não recebe ocorrências)
 * e a ocorrência de nota registrada pelo caminho de produção.
 */
import { SQL } from 'bun'
import { eq } from 'drizzle-orm'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'

import { createSendOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { DrizzleOccurrenceMailRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  companyOccurrenceTypes,
  contractorContacts,
  contractorMailSettings,
  contractors,
  nfeParticipants,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import {
  databaseUrl,
  fakeAttachmentStorage,
  JPEG_BYTES,
  seedCompany,
  seedTrip,
} from './trip-field-office-database.fixture.js'
import type { Company, SeededTrip, TestDatabase } from './trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '11222333000181'

export type Seeded = {
  readonly company: Company
  readonly contactIds: readonly string[]
  readonly occurrenceId: string
}

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

/** Empresa com e-mail verificado, a nota cujo emitente é contratante, dois contatos e a ocorrência. */
export async function seedMailScenario(database: TestDatabase): Promise<Seeded> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const nfeDocumentId = await nfeDocumentIdOf(database, trip)
  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'Contratante Alfa',
    id: contractorId,
    taxId: EMITTER_TAX_ID,
  })
  await database.db.insert(nfeParticipants).values({
    companyId: company.companyId,
    documentId: nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Contratante Alfa Indústria Ltda',
    role: 'emitter',
    taxId: EMITTER_TAX_ID,
    tradeName: 'Contratante Alfa',
  })
  const contacts = await database.db
    .insert(contractorContacts)
    .values([
      { companyId: company.companyId, contractorId, email: 'compras@alfa.example.test' },
      { companyId: company.companyId, contractorId, email: 'fiscal@alfa.example.test' },
      {
        companyId: company.companyId,
        contractorId,
        email: 'sem-ocorrencia@alfa.example.test',
        receivesOccurrences: false,
      },
    ])
    .returning({ id: contractorContacts.id })
  await database.db.insert(contractorMailSettings).values({
    companyId: company.companyId,
    replyDomain: 'resposta.example.test',
    secretEnvelope: {},
    senderAddress: 'ocorrencias@transportadora.example.test',
    senderName: 'Transportadora Sintética',
    sendingVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  })

  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    emailBody: 'Ocorrência na nota {{numeroNota}}: {{observacao}}',
    emailSubject: 'Ocorrência — NF {{numeroNota}}',
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
  return {
    company,
    contactIds: contacts.map((contact) => contact.id),
    occurrenceId: occurrence.id,
  }
}

export function createOccurrenceMailUseCase(database: TestDatabase) {
  return createSendOccurrenceMailUseCase({
    fingerprintService: {
      create: async ({ fields }) =>
        fields.map((field) => new TextDecoder().decode(field)).join('|'),
    },
    now: () => new Date('2026-09-24T18:00:00.000Z'),
    secretService: {
      decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'b'.repeat(64) }),
    } as never,
    unitOfWork: new DrizzleOccurrenceMailRepository(database.db),
  })
}

/**
 * O banco descartável com a configuração de **produção** (`createDatabaseProvider`, `prepare:
 * false`). As leituras da conversa fazem consultas em paralelo (`Promise.all`), e com as instruções
 * preparadas do `createDrizzleProvider` cru o Bun SQL 1.3.14 perdia a conexão no meio do teste
 * (`PostgresError: Failed to read data`) — a mesma causa medida na spec 137 e na 148 T7.
 */
export async function withConversationDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_183_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: ReturnType<typeof createDatabaseProvider> | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDatabaseProvider({
      pool: { connectTimeoutSeconds: 10, max: 10, queryTimeoutMs: 20_000 },
      url: disposableUrl.toString(),
    })
    await operation(database as unknown as TestDatabase)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
