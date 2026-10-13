/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.5 (ADR-0101 §9), contra Postgres real: o aviso do sino do motorista, emitido pelo gateway
 * de verdade (a fila fica em memória). Nota e viagem nascem na chave nova, com `subjectType`, `subjectId`,
 * `subjectLabel` e `protocol` — sem o corpo e sem nome de pessoa; a ocorrência segue na chave de sempre,
 * só com os campos extras; a mesma `Idempotency-Key` não gera segundo aviso.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { occurrenceConversations, tripDocuments } from '../../src/database/database.schema.js'
import { createSendDriverAppMessageUseCase } from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { createDriverConversationNotifier } from '../../src/occurrence-conversation/infrastructure/driver-conversation-notifier.gateway.js'
import { createOfficeSubjectNotifier } from '../../src/occurrence-conversation/infrastructure/office-subject-notifier.adapter.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'
import { firstTripOf } from '../fixtures/driver-subject-conversation-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  createOfficeHarness,
  seedProfile,
} from '../fixtures/office-subject-conversation-database.fixture.js'
import {
  linkDriverMembership,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const PROTOCOL_PATTERN = /^\d{6}-[2-9A-HJKMNP-Z]{4}$/u
const BODY_TEXT = 'Pode subir a nota agora?'
const OPERATOR_NAME = 'Marta da Operação'
const DRIVER_NAME = 'João da Silva'

type Emission = {
  readonly category: string
  readonly dedupeKey: string
  readonly payload: Record<string, unknown>
  readonly recipientUserId: string
  readonly templateKey: string
}

function createEmissions() {
  const emissions: Emission[] = []
  const gateway = createDriverConversationNotifier({
    logger: { warn: () => undefined },
    send: async (params) => void emissions.push(params as Emission),
  })
  return { emissions, gateway }
}

async function scenario(database: TestDatabase) {
  const seeded = await seedMailScenario(database)
  const { company } = seeded
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const tripId = await firstTripOf(database.db, company)
  const [link] = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.companyId, company.companyId))
  if (link === undefined) throw new Error('EXPECTED_LINK')
  await seedProfile(database.db, company.userId, OPERATOR_NAME)
  await seedProfile(database.db, driverUserId, DRIVER_NAME)
  return { company, driverUserId, linkId: link.id, seeded, tripId }
}

async function protocolOf(database: TestDatabase, conversationId: string): Promise<string> {
  const [row] = await database.db
    .select({ protocol: occurrenceConversations.protocol })
    .from(occurrenceConversations)
    .where(eq(occurrenceConversations.id, conversationId))
  return row?.protocol ?? ''
}

function expectNoLeak(emissions: readonly Emission[]): void {
  const serialized = JSON.stringify(emissions)
  expect(serialized).not.toContain(BODY_TEXT)
  expect(serialized).not.toContain(OPERATOR_NAME)
  expect(serialized).not.toContain(DRIVER_NAME)
}

describe('o aviso do sino por assunto contra Postgres (spec 263 T2.5)', () => {
  testWithPostgres(
    'nota e viagem: um aviso por mensagem, na chave nova, com o assunto e o protocolo da conversa',
    async () => {
      await withConversationDatabase(async (database) => {
        const { company, driverUserId, linkId, tripId } = await scenario(database)
        const { emissions, gateway } = createEmissions()
        const harness = createOfficeHarness(
          database.db,
          () => new Date(),
          createOfficeSubjectNotifier(gateway),
        )
        const base = {
          actorUserId: company.userId,
          bodyText: BODY_TEXT,
          companyId: company.companyId,
          tripId,
        }
        const note = { ...base, subjectId: linkId, subjectType: 'document' as const }
        const trip = { ...base, subjectId: tripId, subjectType: 'trip' as const }

        const noteSent = await harness.office.send.send({
          ...note,
          idempotencyKey: 'notice-note-key-0001',
        })
        await harness.office.send.send({ ...note, idempotencyKey: 'notice-note-key-0001' })
        const tripSent = await harness.office.send.send({
          ...trip,
          idempotencyKey: 'notice-trip-key-0001',
        })
        await harness.office.send.send({ ...trip, idempotencyKey: 'notice-trip-key-0001' })

        expect(emissions).toHaveLength(2)
        const [noteNotice, tripNotice] = emissions as [Emission, Emission]
        for (const [notice, sent, subject] of [
          [noteNotice, noteSent, note],
          [tripNotice, tripSent, trip],
        ] as const) {
          expect(notice).toMatchObject({
            category: 'trip',
            dedupeKey: `trip.subject-conversation-message:${sent.message.id}`,
            recipientUserId: driverUserId,
            templateKey: 'trip.subject-conversation-message',
          })
          expect(Object.keys(notice.payload).toSorted()).toEqual([
            'protocol',
            'subjectId',
            'subjectLabel',
            'subjectType',
          ])
          expect(notice.payload).toMatchObject({
            subjectId: subject.subjectId,
            subjectType: subject.subjectType,
          })
          expect(notice.payload.protocol).toMatch(PROTOCOL_PATTERN)
          expect(String(notice.payload.subjectLabel).length).toBeGreaterThan(0)
        }
        expect(noteNotice.payload.subjectLabel).toMatch(/^NF /u)
        expectNoLeak(emissions)
      })
    },
    120_000,
  )

  testWithPostgres(
    'ocorrência: a chave de sempre, o campo antigo intacto e só os extras a mais',
    async () => {
      await withConversationDatabase(async (database) => {
        const { company, driverUserId, seeded } = await scenario(database)
        const { emissions, gateway } = createEmissions()
        const send = createSendDriverAppMessageUseCase({
          clock: () => new Date(),
          fingerprintService: {
            create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
              fields.map((field) => new TextDecoder().decode(field)).join('|'),
          },
          notifier: gateway,
          storage: UNUSED_ATTACHMENT_STORAGE,
          unitOfWork: createDrizzleDriverConversationUnitOfWork(database.db),
        })
        const input = {
          actorUserId: company.userId,
          bodyText: BODY_TEXT,
          companyId: company.companyId,
          idempotencyKey: 'notice-occurrence-key-01',
          occurrenceId: seeded.occurrenceId,
        }

        const sent = await send.send(input)
        await send.send(input)

        expect(emissions).toHaveLength(1)
        const [notice] = emissions as [Emission]
        expect(notice).toMatchObject({
          category: 'trip',
          dedupeKey: `trip.conversation-message:${sent.conversationMessageId}`,
          recipientUserId: driverUserId,
          templateKey: 'trip.conversation-message',
        })
        expect(notice.payload).toEqual({
          occurrenceLabel: expect.stringMatching(/^NF /u),
          protocol: await protocolOf(database, sent.conversationId),
          subjectId: seeded.occurrenceId,
          subjectLabel: notice.payload.occurrenceLabel,
          subjectType: 'occurrence',
        })
        expect(String(notice.payload.protocol)).toMatch(PROTOCOL_PATTERN)
        expectNoLeak(emissions)
      })
    },
    120_000,
  )
})
