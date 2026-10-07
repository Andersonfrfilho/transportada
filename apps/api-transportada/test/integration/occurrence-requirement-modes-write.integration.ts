/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.4 (D-a, RF1, RF9), contra Postgres real: a escrita do tipo e das exceções distingue os
 * três estados — **ausente** (não mexa), **nulo** (herda do tipo) e **valor** — e a assinatura do
 * registro do motorista vai para `signature_object_id`, nunca para a tabela de anexos de foto.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import {
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
} from '../../src/database/trip.schema.js'
import {
  listOccurrenceTypes,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import {
  registerStreetOccurrence,
  seedConfirmedUpload,
} from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const RECIPIENT_TAX_ID = '12345678000190'
const EMITTER_TAX_ID = '30290856000160'

function typeValues(company: Company, extra: Record<string, unknown> = {}) {
  return {
    active: true,
    companyId: company.companyId,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: null,
    stage: 'delivery' as const,
    ...extra,
  }
}

describe('o tipo grava noteMode e signatureMode, e ausente não altera (spec 246 T2.4)', () => {
  testWithPostgres('cria com os modos, regrava sem eles e depois os troca', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)

      const created = await saveOccurrenceType(
        database.db,
        typeValues(company, { flow: 'document', noteMode: 'required', signatureMode: 'optional' }),
      )
      expect(created).toMatchObject({ noteMode: 'required', signatureMode: 'optional' })

      // O editor antigo regrava só o nome: os dois modos têm de sobreviver.
      const renamed = await saveOccurrenceType(
        database.db,
        typeValues(company, { name: 'Recusa parcial', occurrenceTypeId: created.id }),
      )
      expect(renamed).toMatchObject({ noteMode: 'required', signatureMode: 'optional' })
      const listed = await listOccurrenceTypes(database.db, { companyId: company.companyId })
      expect(listed[0]).toMatchObject({ noteMode: 'required', signatureMode: 'optional' })

      const changed = await saveOccurrenceType(
        database.db,
        typeValues(company, {
          name: 'Recusa parcial',
          noteMode: 'off',
          occurrenceTypeId: created.id,
          signatureMode: 'required',
        }),
      )
      expect(changed).toMatchObject({ noteMode: 'off', signatureMode: 'required' })
    })
  })

  testWithPostgres(
    'tipo criado sem os modos nasce com o padrão: observação opcional, assinatura desligada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)

        const created = await saveOccurrenceType(
          database.db,
          typeValues(company, { flow: 'document' }),
        )

        expect(created).toMatchObject({ noteMode: 'optional', signatureMode: 'off' })
      })
    },
  )
})

async function seedOverrideOwners(database: TestDatabase, company: Company) {
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: company.companyId, taxId: RECIPIENT_TAX_ID })
  const type = await saveOccurrenceType(database.db, typeValues(company, { flow: 'document' }))
  return { contractorId, typeId: type.id }
}

describe('a exceção distingue ausente, nulo e valor (spec 246 T2.4, D-a)', () => {
  testWithPostgres('substituição total: o que não veio fica; nulo herda; valor grava', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const { contractorId, typeId } = await seedOverrideOwners(database, company)
      const repository = new DrizzleOccurrenceAttachmentOverridesRepository(database.db)
      const scope = { companyId: company.companyId, occurrenceTypeId: typeId }
      const read = async () =>
        (await repository.listContractorOverrides(scope)).find(
          (row) => row.contractorId === contractorId,
        )

      // 1. Linha nova com os campos novos: nulo grava nulo (herda), valor grava valor.
      await repository.replaceContractorOverrides({
        ...scope,
        overrides: [
          {
            attachmentMode: 'required',
            contractorId,
            itemsMinimumCount: null,
            itemsMode: 'required',
            noteMode: null,
            photoMinimumCount: 3,
            signatureMode: 'required',
          },
        ],
      })
      expect(await read()).toMatchObject({
        attachmentMode: 'required',
        itemsMinimumCount: null,
        itemsMode: 'required',
        noteMode: null,
        photoMinimumCount: 3,
        signatureMode: 'required',
      })

      // 2. O painel antigo reenvia só a foto: nenhum campo novo é apagado.
      await repository.replaceContractorOverrides({
        ...scope,
        overrides: [{ attachmentMode: 'optional', contractorId }],
      })
      expect(await read()).toMatchObject({
        attachmentMode: 'optional',
        itemsMode: 'required',
        noteMode: null,
        photoMinimumCount: 3,
        signatureMode: 'required',
      })

      // 3. Nulo explícito devolve o campo ao tipo; valor novo troca.
      await repository.replaceContractorOverrides({
        ...scope,
        overrides: [
          {
            attachmentMode: 'optional',
            contractorId,
            itemsMode: null,
            noteMode: 'required',
            photoMinimumCount: null,
            signatureMode: null,
          },
        ],
      })
      expect(await read()).toMatchObject({
        itemsMode: null,
        noteMode: 'required',
        photoMinimumCount: null,
        signatureMode: null,
      })
    })
  })

  testWithPostgres(
    'linha nova de cliente que não conhece a observação: ela segue a foto, como a regra da 179',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const { contractorId, typeId } = await seedOverrideOwners(database, company)
        const repository = new DrizzleOccurrenceAttachmentOverridesRepository(database.db)
        const scope = { companyId: company.companyId, occurrenceTypeId: typeId }

        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'required', contractorId }],
        })
        expect((await repository.listContractorOverrides(scope))[0]?.noteMode).toBe('required')

        await repository.replaceContractorOverrides({ ...scope, overrides: [] })
        await repository.replaceContractorOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'optional', contractorId }],
        })
        expect((await repository.listContractorOverrides(scope))[0]?.noteMode).toBe('optional')

        await repository.replaceRecipientOverrides({
          ...scope,
          overrides: [{ attachmentMode: 'required', taxId: RECIPIENT_TAX_ID }],
        })
        expect(await repository.listRecipientOverrides(scope)).toMatchObject([
          { attachmentMode: 'required', noteMode: 'required', signatureMode: null },
        ])
      })
    },
  )
})

describe('a assinatura do registro vai para a coluna própria (spec 246 T2.4, RF9)', () => {
  testWithPostgres(
    'signature_object_id gravado; nenhuma linha de anexo nasce por ela',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const type = await saveOccurrenceType(
          database.db,
          typeValues(company, { flow: 'document', signatureMode: 'required' }),
        )
        const signatureId = await seedConfirmedUpload(database, { company, trip })

        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company,
          signatureObjectId: signatureId,
          trip,
          typeId: type.id,
        })

        const [row] = await database.db
          .select({
            attachmentObjectId: tripDocumentOccurrences.attachmentObjectId,
            signatureObjectId: tripDocumentOccurrences.signatureObjectId,
          })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.id, saved.id))
        expect(row).toEqual({ attachmentObjectId: null, signatureObjectId: signatureId })
        const attachments = await database.db
          .select({ id: tripDocumentOccurrenceAttachments.id })
          .from(tripDocumentOccurrenceAttachments)
          .where(
            and(
              eq(tripDocumentOccurrenceAttachments.companyId, company.companyId),
              eq(tripDocumentOccurrenceAttachments.occurrenceId, saved.id),
            ),
          )
        expect(attachments).toHaveLength(0)
      })
    },
  )
})
