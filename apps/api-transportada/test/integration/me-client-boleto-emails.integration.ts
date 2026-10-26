/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T4 (RF2/RF3/RF11, D4/D5, CA3), contra Postgres real: o motorista lista os e-mails do cliente só
 * mascarados, envia o boleto a eles ou a um endereço novo (que só entra no cadastro com `save`, com o autor
 * `driver`), e nada disso alcança a ocorrência de outra viagem, de outra empresa, de tipo `off` ou de
 * encaminhamento desligado.
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  deliveryClientEmails,
  deliveryClients,
  nfeParticipants,
  occurrenceContractorReplyDeliveries,
  tripDocumentOccurrences,
  tripDocuments,
  tripDrivers,
} from '../../src/database/database.schema.js'
import { createDriverClientBoletoEmailsUseCase } from '../../src/occurrence-conversation/application/driver-client-boleto-emails.use-case.js'
import { createForwardContractorReplyByEmailUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import { ContractorReplyEmailForwardDisabledError } from '../../src/occurrence-conversation/domain/contractor-reply-email.error.js'
import {
  createDrizzleContractorReplyEmailReader,
  createDrizzleContractorReplyEmailUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-email.repository.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import type { ClientEmailType } from '../../src/shared/delivery-client-email.constant.js'
import { OccurrenceClientEmailOffError } from '../../src/trips/domain/occurrence-client-email.error.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import {
  openReplyWithForward,
  receivePdfReply,
} from '../fixtures/contractor-reply-database.fixture.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const CLIENT_TAX_ID = '12345678000188'
const FINANCE_EMAIL = 'financeiro@mercado.example.test'
const NEW_EMAIL = 'novo@mercado.example.test'

async function seedClient(database: TestDatabase, seeded: Seeded) {
  const { companyId, userId } = seeded.company
  const [document] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocumentOccurrences)
    .innerJoin(tripDocuments, eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId))
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (document?.nfeDocumentId === null || document?.nfeDocumentId === undefined) {
    throw new Error('EXPECTED_NFE_DOCUMENT')
  }
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId: document.nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Mercado Beta',
    role: 'recipient',
    taxId: CLIENT_TAX_ID,
  })
  await database.db.insert(deliveryClients).values({
    companyId,
    displayName: 'Mercado Beta',
    taxId: CLIENT_TAX_ID,
  })
  const [finance] = await database.db
    .insert(deliveryClientEmails)
    .values({
      address: FINANCE_EMAIL,
      companyId,
      createdByKind: 'office',
      createdByUserId: userId,
      label: 'financeiro',
      purpose: 'boleto',
      taxId: CLIENT_TAX_ID,
    })
    .returning({ id: deliveryClientEmails.id })
  if (finance === undefined) throw new Error('EXPECTED_CLIENT_EMAIL')
  return { financeId: finance.id }
}

async function setClientEmailType(
  database: TestDatabase,
  seeded: Seeded,
  clientEmailType: ClientEmailType,
): Promise<void> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (occurrence?.typeId === null || occurrence?.typeId === undefined) {
    throw new Error('EXPECTED_OCCURRENCE_TYPE')
  }
  await database.db
    .update(companyOccurrenceTypes)
    .set({ clientEmailType })
    .where(eq(companyOccurrenceTypes.id, occurrence.typeId))
}

async function prepare(
  database: TestDatabase,
  forward: { informed: 'manual' | 'off'; note: 'automatic' | 'manual' | 'off' } = {
    informed: 'manual',
    note: 'off',
  },
) {
  const seeded = await seedMailScenario(database)
  const { companyId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, forward)
  await receivePdfReply(database, { companyId, conversationId })
  const client = await seedClient(database, seeded)
  await setClientEmailType(database, seeded, 'boleto')
  const useCase = createDriverClientBoletoEmailsUseCase({
    emailOptions: createDrizzleContractorReplyEmailReader(database.db),
    forwardByEmail: createForwardContractorReplyByEmailUseCase({
      unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database.db),
    }),
    unitOfWork: createDrizzleDriverConversationUnitOfWork(database.db),
  })
  const scope = {
    companyId,
    driverId: seeded.company.firstDriverId,
    driverUserId: seeded.company.userId,
    occurrenceId: seeded.occurrenceId,
  }
  return { client, companyId, scope, seeded, useCase }
}

function sendOf(scope: ScopeShape, overrides: object = {}) {
  return {
    ...scope,
    correlationId: `correlation-${crypto.randomUUID()}`,
    emailIds: [] as readonly string[],
    idempotencyKey: `key-${crypto.randomUUID()}`,
    save: false,
    ...overrides,
  }
}
type ScopeShape = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
  readonly occurrenceId: string
}

describe('os e-mails do cliente para o boleto no app do motorista (spec 279 T4, CA3)', () => {
  testWithPostgres(
    'lista só mascarado, envia ao guardado, e o endereço novo com save entra no cadastro como motorista',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, companyId, scope, useCase } = await prepare(database)

        const listed = await useCase.list(scope)
        expect(listed.clientEmailType).toBe('boleto')
        expect(listed.clientEmails).toEqual([
          {
            addressMasked: 'f***@m***.example.test',
            emailId: client.financeId,
            label: 'financeiro',
          },
        ])
        expect(JSON.stringify(listed)).not.toContain(FINANCE_EMAIL)

        const sent = await useCase.send(sendOf(scope, { emailIds: [client.financeId] }))
        expect(sent.results).toMatchObject([{ emailId: client.financeId, kind: 'queued' }])
        expect(JSON.stringify(sent)).not.toContain(FINANCE_EMAIL)
        /** Spec 279 T6b (RF12): o estado do envio chega ao motorista com o endereço que a conversa dele já mostra. */
        const afterSend = await useCase.list(scope)
        expect(afterSend.deliveries).toMatchObject([
          { address: FINANCE_EMAIL, sentAt: null, status: 'queued' },
        ])
        expect(JSON.stringify(afterSend.clientEmails)).not.toContain(FINANCE_EMAIL)

        const withNew = await useCase.send(sendOf(scope, { newAddress: NEW_EMAIL, save: true }))
        expect(withNew.results).toMatchObject([{ kind: 'queued' }])
        expect(withNew.savedEmailId).not.toBeNull()
        const saved = await database.db
          .select({ createdByKind: deliveryClientEmails.createdByKind })
          .from(deliveryClientEmails)
          .where(
            and(
              eq(deliveryClientEmails.companyId, companyId),
              eq(deliveryClientEmails.address, NEW_EMAIL),
            ),
          )
        expect(saved).toEqual([{ createdByKind: 'driver' }])

        const unsaved = await useCase.send(
          sendOf(scope, { newAddress: 'so-envia@mercado.example.test' }),
        )
        expect(unsaved.savedEmailId).toBeNull()
        const rows = await database.db
          .select({ id: deliveryClientEmails.id })
          .from(deliveryClientEmails)
          .where(eq(deliveryClientEmails.companyId, companyId))
        expect(rows).toHaveLength(2)
      })
    },
    60_000,
  )

  testWithPostgres(
    'o envio automático sem e-mail do cliente (T3c) aparece como pulado, sem endereço e sem o motivo da recusa',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, scope, useCase } = await prepare(database)
        await database.db.execute(sql`
          insert into occurrence_contractor_reply_deliveries
            (company_id, reply_id, target, trigger, status, reason, attachment_id, actor_user_id, idempotency_key)
          select r.company_id, r.id, 'client_boleto_emails', 'automatic', 'skipped', 'client_without_email',
                 r.reply_attachment_id, null, 'skip-' || r.id::text
          from occurrence_contractor_replies r
          where r.company_id = ${companyId}::uuid`)
        const listed = await useCase.list(scope)
        expect(listed.deliveries).toMatchObject([
          { address: null, sentAt: null, status: 'skipped' },
        ])
        expect(JSON.stringify(listed.deliveries)).not.toContain('client_without_email')
      })
    },
    60_000,
  )

  testWithPostgres(
    'a mesma chave não duplica o envio',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, companyId, scope, useCase } = await prepare(database)
        const input = sendOf(scope, { emailIds: [client.financeId] })
        await useCase.send(input)
        const repeated = await useCase.send({
          ...input,
          idempotencyKey: `other-${crypto.randomUUID()}`,
        })
        expect(repeated.results).toMatchObject([{ kind: 'already_queued' }])
        const deliveries = await database.db
          .select({ id: occurrenceContractorReplyDeliveries.id })
          .from(occurrenceContractorReplyDeliveries)
          .where(eq(occurrenceContractorReplyDeliveries.companyId, companyId))
        expect(deliveries).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'motorista fora da tripulação e de outra empresa não lista nem envia (404)',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, scope, seeded, useCase } = await prepare(database)
        const { company } = seeded
        await database.db
          .delete(tripDrivers)
          .where(eq(tripDrivers.driverId, company.secondDriverId))
        const outsider = { ...scope, driverId: company.secondDriverId }
        await expect(useCase.list(outsider)).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
        await expect(
          useCase.send(sendOf(outsider, { emailIds: [client.financeId] })),
        ).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)

        const foreign = await seedMailScenario(database)
        const foreignScope = {
          companyId: foreign.company.companyId,
          driverId: foreign.company.firstDriverId,
          driverUserId: foreign.company.userId,
          occurrenceId: seeded.occurrenceId,
        }
        await expect(useCase.list(foreignScope)).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
        await expect(
          useCase.send(sendOf(foreignScope, { newAddress: NEW_EMAIL })),
        ).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
      })
    },
    60_000,
  )

  testWithPostgres(
    'tipo off recusa com 409, e o encaminhamento desligado também',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, scope, seeded, useCase } = await prepare(database)
        await setClientEmailType(database, seeded, 'off')
        await expect(useCase.list(scope)).rejects.toBeInstanceOf(OccurrenceClientEmailOffError)
        await expect(
          useCase.send(sendOf(scope, { emailIds: [client.financeId] })),
        ).rejects.toBeInstanceOf(OccurrenceClientEmailOffError)
      })
      await withConversationDatabase(async (database) => {
        const { client, scope, useCase } = await prepare(database, { informed: 'off', note: 'off' })
        await expect(useCase.list(scope)).rejects.toBeInstanceOf(
          ContractorReplyEmailForwardDisabledError,
        )
        await expect(
          useCase.send(sendOf(scope, { emailIds: [client.financeId] })),
        ).rejects.toBeInstanceOf(ContractorReplyEmailForwardDisabledError)
      })
    },
    90_000,
  )
})
