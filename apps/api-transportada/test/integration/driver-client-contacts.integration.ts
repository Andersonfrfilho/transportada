/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b (D13) contra Postgres real: na abertura da ocorrência o motorista lista, acrescenta, edita e remove os
 * contatos do cliente da nota — vários números e vários e-mails — mas só mexe no que ele mesmo informou; o que o
 * escritório cadastrou ele só vê. Nota de outra viagem responde como inexistente e a auditoria não leva o endereço.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  auditLogs,
  deliveryClientContacts,
  deliveryClients,
  nfeParticipants,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createDriverClientContactsUseCase } from '../../src/delivery-clients/application/driver-client-contacts.use-case.js'
import { DrizzleDriverClientContactRepository } from '../../src/delivery-clients/infrastructure/drizzle-driver-client-contacts.repository.js'
import { DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE } from '../../src/shared/delivery-client-email.constant.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const CLIENT_TAX_ID = '12345678000188'
const OFFICE_EMAIL = 'financeiro@mercado.example.test'

async function prepare(database: TestDatabase) {
  const seeded: Seeded = await seedMailScenario(database)
  const { companyId, userId } = seeded.company
  const [link] = await database.db
    .select({
      documentId: tripDocuments.id,
      nfeDocumentId: tripDocuments.nfeDocumentId,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(tripDocuments, eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId))
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  if (link?.nfeDocumentId === null || link?.nfeDocumentId === undefined) {
    throw new Error('EXPECTED_NFE_DOCUMENT')
  }
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId: link.nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Mercado Beta',
    role: 'recipient',
    taxId: CLIENT_TAX_ID,
  })
  await database.db
    .insert(deliveryClients)
    .values({ companyId, displayName: 'Mercado Beta', taxId: CLIENT_TAX_ID })
  const [office] = await database.db
    .insert(deliveryClientContacts)
    .values({
      address: OFFICE_EMAIL,
      companyId,
      createdByKind: 'office',
      createdByUserId: userId,
      label: 'financeiro',
      purpose: 'boleto',
      taxId: CLIENT_TAX_ID,
    })
    .returning({ id: deliveryClientContacts.id })
  if (office === undefined) throw new Error('EXPECTED_OFFICE_CONTACT')
  const actor = {
    companyId,
    correlationId: 'corr-281-t8b',
    driverId: seeded.company.firstDriverId,
    userId,
  }
  const useCase = createDriverClientContactsUseCase({
    repository: new DrizzleDriverClientContactRepository(database.db),
  })
  return { actor, documentId: link.documentId, officeId: office.id, useCase }
}

describe('contatos do cliente na abertura da ocorrência (spec 281 T8b)', () => {
  testWithPostgres(
    'lista mascarado, acrescenta vários números e e-mails e edita e remove só o que é dele',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, documentId, officeId, useCase } = await prepare(database)

        const first = await useCase.list({ actor, documentId })
        expect(first).toMatchObject([{ channel: 'email', contactId: officeId, editable: false }])
        expect(JSON.stringify(first)).not.toContain(OFFICE_EMAIL)

        const phone1 = await useCase.add({
          actor,
          address: '(16) 99999-1111',
          channel: 'whatsapp',
          documentId,
          label: 'balcão',
        })
        const phone2 = await useCase.add({
          actor,
          address: '16 98888 2222',
          channel: 'whatsapp',
          documentId,
          label: '',
        })
        const mail2 = await useCase.add({
          actor,
          address: ' Novo@Mercado.example.test ',
          channel: 'email',
          documentId,
          label: '',
        })
        expect([phone1, phone2, mail2].map((result) => result.created)).toEqual([true, true, true])
        expect(phone1.contact.editable).toBe(true)

        // O mesmo número outra vez devolve o existente, sem duplicar.
        const again = await useCase.add({
          actor,
          address: '+5516999991111',
          channel: 'whatsapp',
          documentId,
          label: 'outro',
        })
        expect(again).toMatchObject({ created: false })
        expect(again.contact.contactId).toBe(phone1.contact.contactId)
        expect(await useCase.list({ actor, documentId })).toHaveLength(4)

        const renamed = await useCase.update({
          actor,
          contactId: phone1.contact.contactId,
          documentId,
          label: 'recebimento',
        })
        expect(renamed.label).toBe('recebimento')
        const changed = await useCase.update({
          actor,
          address: '(16) 97777-3333',
          contactId: phone2.contact.contactId,
          documentId,
        })
        expect(changed.contactId).toBe(phone2.contact.contactId)
        const [stored] = await database.db
          .select({ address: deliveryClientContacts.address })
          .from(deliveryClientContacts)
          .where(eq(deliveryClientContacts.id, phone2.contact.contactId))
        expect(stored?.address).toBe('+5516977773333')

        // O do escritório é só leitura: editar e remover respondem como inexistente.
        await expect(
          useCase.update({ actor, contactId: officeId, documentId, label: 'x' }),
        ).rejects.toMatchObject({ code: 'DRIVER_CLIENT_CONTACT_NOT_FOUND', status: 404 })
        await expect(
          useCase.remove({ actor, contactId: officeId, documentId }),
        ).rejects.toMatchObject({
          code: 'DRIVER_CLIENT_CONTACT_NOT_FOUND',
        })

        await useCase.remove({ actor, contactId: phone1.contact.contactId, documentId })
        expect(await useCase.list({ actor, documentId })).toHaveLength(3)

        const audit = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityType, 'delivery_client_contact'))
        expect(audit.map((row) => row.action).sort()).toEqual([
          'delivery-client-contact.created',
          'delivery-client-contact.created',
          'delivery-client-contact.created',
          'delivery-client-contact.removed',
          'delivery-client-contact.updated',
          'delivery-client-contact.updated',
        ])
        const serialized = JSON.stringify(audit)
        expect(serialized).not.toContain('99999')
        expect(serialized).not.toContain('mercado.example')
      })
    },
  )

  testWithPostgres(
    'valida a forma, respeita o limite por canal e esconde nota alheia',
    async () => {
      await withConversationDatabase(async (database) => {
        const { actor, documentId, useCase } = await prepare(database)
        await expect(
          useCase.add({ actor, address: '123', channel: 'whatsapp', documentId, label: '' }),
        ).rejects.toMatchObject({ status: 400 })
        await expect(
          useCase.add({ actor, address: 'sem-arroba', channel: 'email', documentId, label: '' }),
        ).rejects.toMatchObject({ code: 'DRIVER_CLIENT_EMAIL_INVALID', status: 400 })

        for (let index = 0; index < DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE; index += 1) {
          await useCase.add({
            actor,
            address: `+55169999${String(index).padStart(5, '0')}`,
            channel: 'whatsapp',
            documentId,
            label: '',
          })
        }
        await expect(
          useCase.add({
            actor,
            address: '+5516911112222',
            channel: 'whatsapp',
            documentId,
            label: '',
          }),
        ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED', status: 422 })

        await expect(
          useCase.list({ actor: { ...actor, driverId: crypto.randomUUID() }, documentId }),
        ).rejects.toMatchObject({ status: 404 })
        await expect(
          useCase.list({ actor, documentId: crypto.randomUUID() }),
        ).rejects.toMatchObject({ status: 404 })
      })
    },
  )
})
