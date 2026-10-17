/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.7 (ADR-0108, D12/D13), contra Postgres real: os destinatários do e-mail à contratante escolhidos no
 * tipo — só em tipo `listed`, só contatos das contratantes da lista; a poda ao tirar a contratante do escopo e ao
 * trocar para `all`; e o `To` do aviso automático e a pré-marcação do diálogo (a escolha vence a etapa; sem nenhum
 * escolhido que sobre, vale a regra de hoje).
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { ContractorContactNotFoundError } from '../../src/contractor-mail/domain/contractor-mail.error.js'
import {
  companyOccurrenceTypeRecipients,
  contractorContacts,
  contractorMailMessages,
  contractors,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createPreviewOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/preview-occurrence-mail.use-case.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import {
  createAutomaticOccurrenceMailReader,
  createOccurrenceMailReader,
  createOccurrenceSuggestedMailReader,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { findActiveContractorTemplate } from '../../src/occurrence-conversation/infrastructure/notification-template.query.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  OccurrenceTypeRecipientNotInScopeError,
  OccurrenceTypeRecipientsRequireListedScopeError,
} from '../../src/trips/domain/occurrence-type-mail.error.js'
import {
  findOccurrenceType,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { toOccurrenceTypeSettingsViews } from '../../src/trips/infrastructure/occurrence-type-contractors.query.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 120_000

type World = {
  /** Contratante da nota (X): a lista do tipo tem X e Y. */
  readonly contractorX: string
  readonly contractorY: string
  readonly contractorZ: string
  readonly seeded: Seeded
  readonly typeId: string
  /** Contatos: x1 = fiscal (de X), y1 (de Y), z1 (de Z, fora da lista). */
  readonly x1: string
  readonly y1: string
  readonly z1: string
}

async function seedContractor(database: TestDatabase, seeded: Seeded, taxId: string, name: string) {
  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId: seeded.company.companyId,
    displayName: name,
    id: contractorId,
    taxId,
  })
  const [contact] = await database.db
    .insert(contractorContacts)
    .values({
      companyId: seeded.company.companyId,
      contractorId,
      email: `contato@${name.toLowerCase()}.example.test`,
    })
    .returning({ id: contractorContacts.id })
  return { contactId: contact?.id ?? '', contractorId }
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const seeded = await seedMailScenario(database)
  const [contractor] = await database.db
    .select({ id: contractors.id })
    .from(contractors)
    .where(eq(contractors.companyId, seeded.company.companyId))
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  const y = await seedContractor(database, seeded, '66777888000100', 'Beta')
  const z = await seedContractor(database, seeded, '55444333000122', 'Gama')
  return {
    contractorX: contractor?.id ?? '',
    contractorY: y.contractorId,
    contractorZ: z.contractorId,
    seeded,
    typeId: occurrence?.typeId ?? '',
    x1: seeded.contactIds[1] ?? '',
    y1: y.contactId,
    z1: z.contactId,
  }
}

function saveType(
  database: TestDatabase,
  world: World,
  overrides: Partial<SaveOccurrenceTypeValues>,
) {
  const { companyId, userId } = world.seeded.company
  return saveOccurrenceTypeWithTemplate({
    companyId,
    findCurrentType: (query) => findOccurrenceType(database.db, query),
    save: (values) =>
      saveOccurrenceType(database.db, {
        ...values,
        actorUserId: userId,
        companyId,
        correlationId: 'corr-save',
      }),
    templates: {
      findContractorTemplate: ({ key }) =>
        findActiveContractorTemplate(database.db, { companyId, key }),
      hasActiveEmailTemplate: async () => true,
    },
    values: {
      active: true,
      emailTemplateKey: null,
      name: 'Caixa violada',
      notifies: false,
      occurrenceTypeId: world.typeId,
      stage: 'separation',
      ...overrides,
    },
  })
}

function listedOf(world: World, ...contractorIds: readonly string[]) {
  return { contractorIds: [...contractorIds], contractorScope: 'listed' as const }
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

async function chosen(database: TestDatabase, world: World): Promise<readonly string[]> {
  const rows = await database.db
    .select({ contactId: companyOccurrenceTypeRecipients.contactId })
    .from(companyOccurrenceTypeRecipients)
    .where(eq(companyOccurrenceTypeRecipients.occurrenceTypeId, world.typeId))
  return rows.map((row) => row.contactId).toSorted()
}

describe('os destinatários escolhidos no tipo (spec 271 T2.7, D12)', () => {
  testWithPostgres(
    'grava num tipo listed, mantém quando o PUT não manda, limpa com [] e a leitura traz nome, e-mail e situação',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        await saveType(database, world, {
          ...listedOf(world, world.contractorX, world.contractorY),
          contractorMailRecipientContactIds: [world.x1, world.y1],
        })
        expect(await chosen(database, world)).toEqual([world.x1, world.y1].toSorted())

        await saveType(database, world, { name: 'Só o nome mudou' })
        expect(await chosen(database, world)).toEqual([world.x1, world.y1].toSorted())

        const [view] = await toOccurrenceTypeSettingsViews(database.db, {
          companyId: world.seeded.company.companyId,
          records: [
            (await findOccurrenceType(database.db, {
              companyId: world.seeded.company.companyId,
              occurrenceTypeId: world.typeId,
            }))!,
          ],
        })
        expect(view?.contractorMailRecipients).toHaveLength(2)
        expect(view?.contractorMailRecipients).toContainEqual({
          contactId: world.x1,
          contractorId: world.contractorX,
          email: 'fiscal@alfa.example.test',
          name: '',
          receivesOccurrences: true,
          status: 'active',
        })

        await saveType(database, world, { contractorMailRecipientContactIds: [] })
        expect(await chosen(database, world)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'tipo all: destinatários são 400, [] é 200; contato fora da lista do tipo, novo inativo ou de outra empresa são recusados',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        const stranger = await seedMailScenario(database)

        expect(
          await captureError(() =>
            saveType(database, world, { contractorMailRecipientContactIds: [world.x1] }),
          ),
        ).toBeInstanceOf(OccurrenceTypeRecipientsRequireListedScopeError)
        await saveType(database, world, { contractorMailRecipientContactIds: [] })

        await saveType(database, world, listedOf(world, world.contractorX, world.contractorY))
        expect(
          await captureError(() =>
            saveType(database, world, { contractorMailRecipientContactIds: [world.z1] }),
          ),
        ).toBeInstanceOf(OccurrenceTypeRecipientNotInScopeError)
        expect(
          await captureError(() =>
            saveType(database, world, {
              contractorMailRecipientContactIds: [stranger.contactIds[0] ?? ''],
            }),
          ),
        ).toBeInstanceOf(ContractorContactNotFoundError)
        expect(
          await captureError(() =>
            saveType(database, world, { contractorMailRecipientContactIds: [crypto.randomUUID()] }),
          ),
        ).toBeInstanceOf(ContractorContactNotFoundError)

        await database.db
          .update(contractorContacts)
          .set({ status: 'inactive' })
          .where(eq(contractorContacts.id, world.y1))
        expect(
          await captureError(() =>
            saveType(database, world, { contractorMailRecipientContactIds: [world.y1] }),
          ),
        ).toBeInstanceOf(OccurrenceTypeRecipientNotInScopeError)
        expect(await chosen(database, world)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o já escolhido que ficou inativo continua na escolha; tirar a contratante da lista leva os contatos dela; trocar para all limpa',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        await saveType(database, world, {
          ...listedOf(world, world.contractorX, world.contractorY),
          contractorMailRecipientContactIds: [world.x1, world.y1],
        })

        await database.db
          .update(contractorContacts)
          .set({ status: 'inactive' })
          .where(eq(contractorContacts.id, world.x1))
        await saveType(database, world, { contractorMailRecipientContactIds: [world.x1, world.y1] })
        expect(await chosen(database, world)).toEqual([world.x1, world.y1].toSorted())

        await saveType(database, world, listedOf(world, world.contractorX))
        expect(await chosen(database, world)).toEqual([world.x1])

        await saveType(database, world, { contractorIds: [], contractorScope: 'all' })
        expect(await chosen(database, world)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('o To com destinatários escolhidos (spec 271 D13, critério 6)', () => {
  async function automaticTo(database: TestDatabase, world: World) {
    const result = await createSendAutomaticOccurrenceMailUseCase({
      reader: createAutomaticOccurrenceMailReader(database.db),
      sendMail: createOccurrenceMailUseCase(database),
    }).send({
      companyId: world.seeded.company.companyId,
      correlationId: `corr-${crypto.randomUUID()}`,
      occurrenceId: world.seeded.occurrenceId,
    })
    expect(result).toMatchObject({ outcome: 'sent' })
    const rows = await database.db
      .select({ to: contractorMailMessages.toAddresses })
      .from(contractorMailMessages)
      .where(eq(contractorMailMessages.companyId, world.seeded.company.companyId))
    return rows.at(-1)?.to.toSorted()
  }

  testWithPostgres(
    'na nota de X o To é só o escolhido de X (o de Y é ignorado); x1 inativo: vale o automático da etapa; o diálogo pré-marca a escolha',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        await saveType(database, world, {
          ...listedOf(world, world.contractorX, world.contractorY),
          contractorMailRecipientContactIds: [world.x1, world.y1],
          emailsContractor: true,
        })

        const preview = await createPreviewOccurrenceMailUseCase({
          reader: createOccurrenceMailReader(database.db),
          suggestedMail: createOccurrenceSuggestedMailReader(database.db),
        }).preview({
          actorUserId: world.seeded.company.userId,
          companyId: world.seeded.company.companyId,
          occurrenceId: world.seeded.occurrenceId,
        })
        expect(
          preview.recipients.filter((recipient) => recipient.preselected).map((r) => r.contactId),
        ).toEqual([world.x1])

        expect(await automaticTo(database, world)).toEqual(['fiscal@alfa.example.test'])

        /** O aviso automático é um por ocorrência: o caso de x1 inativo roda numa empresa nova. */
        const second = await seedWorld(database)
        await saveType(database, second, {
          ...listedOf(second, second.contractorX, second.contractorY),
          contractorMailRecipientContactIds: [second.x1],
          emailsContractor: true,
        })
        await database.db
          .update(contractorContacts)
          .set({ status: 'inactive' })
          .where(eq(contractorContacts.id, second.x1))
        expect(await automaticTo(database, second)).toEqual(['compras@alfa.example.test'])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'tipo all ou sem escolha: o To é o automático da etapa, como hoje',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        await saveType(database, world, { emailsContractor: true })

        expect(await automaticTo(database, world)).toEqual([
          'compras@alfa.example.test',
          'fiscal@alfa.example.test',
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )
})
