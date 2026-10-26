/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3 (D3/D4, CA2), contra Postgres real: o boleto da contratante aos e-mails para boleto do cadastro do
 * cliente de entrega (o destinatário da nota). Um e-mail por endereço no trilho da 248, idempotente por (retorno,
 * anexo, endereço); o endereço novo só entra no cadastro com `save`, sem duplicar e com `audit_logs`; o `emailId` de
 * outro cliente ou de outra empresa não envia; a leitura das opções traz o cadastro só mascarado.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  auditLogs,
  contractorMailMessages,
  deliveryClientEmails,
  deliveryClients,
  nfeParticipants,
  occurrenceContractorReplyDeliveries,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createForwardContractorReplyByEmailUseCase } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import type { ForwardContractorReplyToClientInput } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import { ContractorReplyClientEmailNotFoundError } from '../../src/occurrence-conversation/domain/contractor-reply-email.error.js'
import {
  createDrizzleContractorReplyEmailReader,
  createDrizzleContractorReplyEmailUnitOfWork,
} from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-email.repository.js'
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
const OWNER_EMAIL = 'dono@mercado.example.test'
const NEW_EMAIL = 'novo@mercado.example.test'

/** O destinatário da nota com cadastro de cliente e os dois e-mails para boleto (mais um de outro tipo). */
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
  const emails = await database.db
    .insert(deliveryClientEmails)
    .values(
      [
        { address: FINANCE_EMAIL, label: 'financeiro', purpose: 'boleto' as const },
        { address: OWNER_EMAIL, label: 'dono', purpose: 'boleto' as const },
        { address: 'nota@mercado.example.test', label: '', purpose: 'invoice' as const },
      ].map((email) => ({
        ...email,
        companyId,
        createdByKind: 'office' as const,
        createdByUserId: userId,
        taxId: CLIENT_TAX_ID,
      })),
    )
    .returning({ id: deliveryClientEmails.id, purpose: deliveryClientEmails.purpose })
  const [finance, owner, invoice] = emails
  if (finance === undefined || owner === undefined || invoice === undefined) {
    throw new Error('EXPECTED_CLIENT_EMAILS')
  }
  return { financeId: finance.id, invoiceId: invoice.id, ownerId: owner.id }
}

async function prepare(database: TestDatabase) {
  const seeded = await seedMailScenario(database)
  const { companyId } = seeded.company
  const conversationId = await openReplyWithForward(database, seeded, {
    informed: 'manual',
    note: 'off',
  })
  const received = await receivePdfReply(database, { companyId, conversationId })
  const client = await seedClient(database, seeded)
  const useCase = createForwardContractorReplyByEmailUseCase({
    unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database.db),
  })
  return { ...received, client, companyId, seeded, useCase }
}

function inputOf(
  seeded: Seeded,
  overrides: Partial<ForwardContractorReplyToClientInput> = {},
): ForwardContractorReplyToClientInput {
  return {
    actorUserId: seeded.company.userId,
    authorKind: 'office',
    companyId: seeded.company.companyId,
    correlationId: `correlation-${crypto.randomUUID()}`,
    emailIds: [],
    idempotencyKey: `key-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
    save: false,
    ...overrides,
  }
}

function clientDeliveriesOf(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      address: occurrenceContractorReplyDeliveries.address,
      status: occurrenceContractorReplyDeliveries.status,
      toAddresses: contractorMailMessages.toAddresses,
      trigger: occurrenceContractorReplyDeliveries.trigger,
    })
    .from(occurrenceContractorReplyDeliveries)
    .innerJoin(
      contractorMailMessages,
      and(
        eq(contractorMailMessages.companyId, occurrenceContractorReplyDeliveries.companyId),
        eq(contractorMailMessages.id, occurrenceContractorReplyDeliveries.mailMessageId),
      ),
    )
    .where(
      and(
        eq(occurrenceContractorReplyDeliveries.companyId, companyId),
        eq(occurrenceContractorReplyDeliveries.target, 'client_boleto_emails'),
      ),
    )
}

describe('o boleto aos e-mails do cadastro do cliente (spec 279 T3, CA2)', () => {
  testWithPostgres(
    'um e-mail por endereço escolhido, e repetir com outra chave não duplica',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, companyId, seeded, useCase } = await prepare(database)
        const emailIds = [client.financeId, client.ownerId]

        const first = await useCase.forwardToClient(inputOf(seeded, { emailIds }))
        expect(first.results.map((result) => [result.emailId, result.kind])).toEqual([
          [client.financeId, 'queued'],
          [client.ownerId, 'queued'],
        ])
        expect(JSON.stringify(first)).not.toContain(FINANCE_EMAIL)
        const deliveries = await clientDeliveriesOf(database, companyId)
        expect(deliveries.map((row) => row.toAddresses).toSorted()).toEqual([
          [OWNER_EMAIL],
          [FINANCE_EMAIL],
        ])
        expect(
          deliveries.every((row) => row.status === 'queued' && row.trigger === 'operator'),
        ).toBe(true)

        const repeated = await useCase.forwardToClient(inputOf(seeded, { emailIds }))
        expect(repeated.results.map((result) => result.kind)).toEqual([
          'already_queued',
          'already_queued',
        ])
        expect(await clientDeliveriesOf(database, companyId)).toHaveLength(2)
      })
    },
    60_000,
  )

  testWithPostgres(
    'endereço novo com save entra no cadastro uma vez, com autor e auditoria, e sai',
    async () => {
      await withConversationDatabase(async (database) => {
        const { companyId, seeded, useCase } = await prepare(database)

        const outcome = await useCase.forwardToClient(
          inputOf(seeded, { address: NEW_EMAIL, authorKind: 'driver', save: true }),
        )
        expect(outcome.results).toMatchObject([{ kind: 'queued' }])
        expect(outcome.savedEmailId).not.toBeNull()

        const saved = await database.db
          .select({
            address: deliveryClientEmails.address,
            createdByKind: deliveryClientEmails.createdByKind,
            id: deliveryClientEmails.id,
          })
          .from(deliveryClientEmails)
          .where(
            and(
              eq(deliveryClientEmails.companyId, companyId),
              eq(deliveryClientEmails.address, NEW_EMAIL),
            ),
          )
        expect(saved).toEqual([
          { address: NEW_EMAIL, createdByKind: 'driver', id: outcome.savedEmailId ?? '' },
        ])
        const audits = await database.db
          .select({ metadata: auditLogs.metadata })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.companyId, companyId),
              eq(auditLogs.action, 'delivery-client-email.created'),
            ),
          )
        expect(audits).toHaveLength(1)
        expect(JSON.stringify(audits)).not.toContain(NEW_EMAIL)

        const again = await useCase.forwardToClient(
          inputOf(seeded, { address: NEW_EMAIL.toUpperCase(), save: true }),
        )
        expect(again.savedEmailId).toBe(outcome.savedEmailId)
        expect(again.results).toMatchObject([{ kind: 'already_queued' }])
        const count = await database.db
          .select({ id: deliveryClientEmails.id })
          .from(deliveryClientEmails)
          .where(eq(deliveryClientEmails.companyId, companyId))
        expect(count).toHaveLength(4)
      })
    },
    60_000,
  )

  testWithPostgres(
    'emailId de outro tipo ou de outra empresa não envia, e a leitura mostra o cadastro mascarado',
    async () => {
      await withConversationDatabase(async (database) => {
        const { client, companyId, seeded, useCase } = await prepare(database)
        await expect(
          useCase.forwardToClient(inputOf(seeded, { emailIds: [client.invoiceId] })),
        ).rejects.toBeInstanceOf(ContractorReplyClientEmailNotFoundError)

        const foreign = await seedMailScenario(database)
        const foreignClient = await seedClient(database, foreign)
        await expect(
          useCase.forwardToClient(inputOf(seeded, { emailIds: [foreignClient.financeId] })),
        ).rejects.toBeInstanceOf(ContractorReplyClientEmailNotFoundError)
        expect(await clientDeliveriesOf(database, companyId)).toEqual([])

        const options = await createDrizzleContractorReplyEmailReader(database.db).read({
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        /** Mesmo `created_at` no lote: a ordem desempata pelo id, então a prova é o conjunto. */
        expect(options?.clientEmails).toHaveLength(2)
        expect(options?.clientEmails).toEqual(
          expect.arrayContaining([
            {
              addressMasked: 'f***@m***.example.test',
              emailId: client.financeId,
              label: 'financeiro',
            },
            { addressMasked: 'd***@m***.example.test', emailId: client.ownerId, label: 'dono' },
          ]),
        )
        expect(JSON.stringify(options)).not.toContain(FINANCE_EMAIL)
      })
    },
    90_000,
  )
})
