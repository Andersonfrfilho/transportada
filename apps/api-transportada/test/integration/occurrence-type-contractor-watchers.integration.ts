/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.6 (ADR-0108, D10/D11), contra Postgres real: os responsáveis em cópia escolhidos no tipo — a gravação
 * (só da lista da empresa, teto de 10, novo inativo recusado, o já escolhido fica), a leitura marcada, a cópia efetiva
 * (tipo ?? contratante ?? empresa) no envio manual, no automático e no reenvio da 248, e a cascata ao remover da lista
 * da empresa, com a auditoria dos tipos afetados.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { DrizzleOccurrenceWatcherRepository } from '../../src/contractor-mail/infrastructure/drizzle-occurrence-watcher.repository.js'
import {
  auditLogs,
  companyOccurrenceTypes,
  contractorMailMessages,
  contractors,
  companyOccurrenceTypeWatchers,
  identityUserProfiles,
  identityUsers,
  membershipRoles,
  tripDocumentOccurrences,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createPreviewOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/preview-occurrence-mail.use-case.js'
import { createResendContractorReplyRequestUseCase } from '../../src/occurrence-conversation/application/resend-contractor-reply-request.use-case.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createDrizzleContractorReplyResendReader } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-reply-resend.repository.js'
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
  OccurrenceTypeWatcherInactiveError,
  OccurrenceTypeWatcherLimitError,
  OccurrenceTypeWatcherNotFoundError,
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

async function seedResponsible(database: TestDatabase, seeded: Seeded, name: string) {
  const userId = crypto.randomUUID()
  const address = `${name.toLowerCase()}@empresa.example.test`
  await database.db.insert(identityUsers).values({ id: userId })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: address,
    contactChannel: 'email',
    email: address,
    name,
    phone: '',
    taxId: '',
    userId,
    username: `${name.toLowerCase()}-${userId.slice(0, 8)}`,
  })
  const [membership] = await database.db
    .insert(userCompanyMemberships)
    .values({ companyId: seeded.company.companyId, status: 'active', userId })
    .returning({ id: userCompanyMemberships.id })
  await database.db
    .insert(membershipRoles)
    .values({ membershipId: membership?.id ?? '', role: 'operator' })
  return { address, userId }
}

type World = {
  readonly ana: { address: string; userId: string }
  readonly bruno: { address: string; userId: string }
  readonly carla: { address: string; userId: string }
  readonly davi: { address: string; userId: string }
  readonly contractorId: string
  readonly seeded: Seeded
  readonly typeId: string
  readonly watchers: DrizzleOccurrenceWatcherRepository
}

/** Empresa {Ana, Bruno}, contratante da nota {Carla}, tipo {Davi} (Davi também na lista da empresa). */
async function seedWorld(database: TestDatabase): Promise<World> {
  const seeded = await seedMailScenario(database)
  const { companyId } = seeded.company
  const [contractor] = await database.db
    .select({ id: contractors.id })
    .from(contractors)
    .where(eq(contractors.companyId, companyId))
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  const people = {
    ana: await seedResponsible(database, seeded, 'Ana'),
    bruno: await seedResponsible(database, seeded, 'Bruno'),
    carla: await seedResponsible(database, seeded, 'Carla'),
    davi: await seedResponsible(database, seeded, 'Davi'),
  }
  const watchers = new DrizzleOccurrenceWatcherRepository(database.db)
  const base = { actorUserId: seeded.company.userId, correlationId: 'corr-271' }
  const company = { companyId, kind: 'company' } as const
  for (const person of [people.ana, people.bruno, people.davi]) {
    await watchers.addWatcher({ ...base, scope: company, userId: person.userId })
  }
  await watchers.addWatcher({
    ...base,
    scope: { companyId, contractorId: contractor?.id ?? '', kind: 'contractor' },
    userId: people.carla.userId,
  })
  return {
    ...people,
    contractorId: contractor?.id ?? '',
    seeded,
    typeId: occurrence?.typeId ?? '',
    watchers,
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
      saveOccurrenceType(database.db, { ...values, actorUserId: userId, companyId }),
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

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
    return undefined
  } catch (error) {
    return error
  }
}

async function chosenUserIds(database: TestDatabase, world: World): Promise<readonly string[]> {
  const rows = await database.db
    .select({ userId: companyOccurrenceTypeWatchers.userId })
    .from(companyOccurrenceTypeWatchers)
    .where(eq(companyOccurrenceTypeWatchers.occurrenceTypeId, world.typeId))
  return rows.map((row) => row.userId).toSorted()
}

describe('os responsáveis em cópia do tipo (spec 271 T2.6, D10)', () => {
  testWithPostgres(
    'grava, mantém quando o PUT não manda, limpa com [] e a leitura marca nome, situação e elegibilidade sem e-mail',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)

        await saveType(database, world, { contractorMailWatcherUserIds: [world.davi.userId] })
        expect(await chosenUserIds(database, world)).toEqual([world.davi.userId])

        await saveType(database, world, { name: 'Só o nome mudou' })
        expect(await chosenUserIds(database, world)).toEqual([world.davi.userId])

        const [view] = await toOccurrenceTypeSettingsViews(database.db, {
          companyId: world.seeded.company.companyId,
          records: [
            (await findOccurrenceType(database.db, {
              companyId: world.seeded.company.companyId,
              occurrenceTypeId: world.typeId,
            }))!,
          ],
        })
        expect(view?.contractorMailWatchers).toEqual([
          { eligible: true, name: 'Davi', status: 'active', userId: world.davi.userId },
        ])
        expect(JSON.stringify(view)).not.toContain('davi@empresa')

        await saveType(database, world, { contractorMailWatcherUserIds: [] })
        expect(await chosenUserIds(database, world)).toEqual([])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'recusa quem não está na lista da empresa (ou é de outra empresa), o excesso e o novo inativo; o já escolhido fica',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        const outsider = await seedResponsible(database, world.seeded, 'Fora')
        const otherCompany = await seedMailScenario(database)
        const stranger = await seedResponsible(database, otherCompany, 'Estranho')
        const base = { actorUserId: world.seeded.company.userId, correlationId: 'corr-r' }
        const company = { companyId: world.seeded.company.companyId, kind: 'company' } as const

        for (const userId of [outsider.userId, stranger.userId]) {
          expect(
            await captureError(() =>
              saveType(database, world, { contractorMailWatcherUserIds: [userId] }),
            ),
          ).toBeInstanceOf(OccurrenceTypeWatcherNotFoundError)
        }

        const extra = await Promise.all(
          Array.from({ length: 9 }, (_, index) =>
            seedResponsible(database, world.seeded, `Extra${index}`),
          ),
        )
        /** A lista da empresa tem teto de 10 ativos: os últimos entram e ficam inativos, só para o excesso passar de 10 escolhidos. */
        for (const [index, person] of extra.entries()) {
          await world.watchers.addWatcher({ ...base, scope: company, userId: person.userId })
          if (index >= 6) {
            await world.watchers.setWatcherStatus({
              ...base,
              scope: company,
              status: 'inactive',
              userId: person.userId,
            })
          }
        }
        const eleven = [world.ana, world.bruno, world.davi, ...extra].map((person) => person.userId)
        expect(
          await captureError(() =>
            saveType(database, world, { contractorMailWatcherUserIds: eleven }),
          ),
        ).toBeInstanceOf(OccurrenceTypeWatcherLimitError)

        await world.watchers.setWatcherStatus({
          ...base,
          scope: company,
          status: 'inactive',
          userId: world.bruno.userId,
        })
        expect(
          await captureError(() =>
            saveType(database, world, { contractorMailWatcherUserIds: [world.bruno.userId] }),
          ),
        ).toBeInstanceOf(OccurrenceTypeWatcherInactiveError)

        await saveType(database, world, { contractorMailWatcherUserIds: [world.ana.userId] })
        await world.watchers.setWatcherStatus({
          ...base,
          scope: company,
          status: 'inactive',
          userId: world.ana.userId,
        })
        await saveType(database, world, { contractorMailWatcherUserIds: [world.ana.userId] })
        expect(await chosenUserIds(database, world)).toEqual([world.ana.userId])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'tirar o responsável da lista da empresa o tira do tipo, e a auditoria nomeia o tipo afetado',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        await saveType(database, world, {
          contractorMailWatcherUserIds: [world.davi.userId, world.ana.userId],
        })

        await world.watchers.removeWatcher({
          actorUserId: world.seeded.company.userId,
          correlationId: 'corr-remove',
          scope: { companyId: world.seeded.company.companyId, kind: 'company' },
          userId: world.davi.userId,
        })

        expect(await chosenUserIds(database, world)).toEqual([world.ana.userId])
        const [audit] = await database.db
          .select({ before: auditLogs.beforeSnapshot })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.companyId, world.seeded.company.companyId),
              eq(auditLogs.action, 'occurrence_watchers.company.remove'),
            ),
          )
        expect(audit?.before).toMatchObject({ occurrenceTypeIds: [world.typeId] })
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('a cópia efetiva do e-mail à contratante: tipo ?? contratante ?? empresa (spec 271 D11, critério 5)', () => {
  async function send(database: TestDatabase, world: World, sequence: number, resend = false) {
    const result = await createOccurrenceMailUseCase(database).send({
      actorUserId: world.seeded.company.userId,
      bodyText: 'Autorizam?',
      companyId: world.seeded.company.companyId,
      contactIds: world.seeded.contactIds.slice(0, 1),
      ...(resend ? { contractorReplyResend: true } : {}),
      correlationId: `corr-${sequence}`,
      idempotencyKey: `key-${sequence}`,
      occurrenceId: world.seeded.occurrenceId,
      subject: 'Ocorrência — NF 1',
    })
    const [row] = await database.db
      .select({ cc: contractorMailMessages.ccAddresses })
      .from(contractorMailMessages)
      .where(eq(contractorMailMessages.id, result.mailMessageId))
    return row?.cc
  }

  testWithPostgres(
    'o tipo vence; tipo vazio herda a contratante; a contratante sem lista herda a empresa; o inativo na lista da empresa herda',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        const base = { actorUserId: world.seeded.company.userId, correlationId: 'corr-s' }
        const company = { companyId: world.seeded.company.companyId, kind: 'company' } as const

        expect(await send(database, world, 1)).toEqual([world.carla.address])

        await saveType(database, world, { contractorMailWatcherUserIds: [world.davi.userId] })
        expect(await send(database, world, 2)).toEqual([world.davi.address])

        const preview = await createPreviewOccurrenceMailUseCase({
          reader: createOccurrenceMailReader(database.db),
          suggestedMail: createOccurrenceSuggestedMailReader(database.db),
        }).preview({
          actorUserId: world.seeded.company.userId,
          companyId: world.seeded.company.companyId,
          occurrenceId: world.seeded.occurrenceId,
        })
        expect(preview.ccSource).toBe('occurrence_type')
        expect(preview.cc.map((entry) => entry.userId)).toEqual([world.davi.userId])

        await world.watchers.setWatcherStatus({
          ...base,
          scope: company,
          status: 'inactive',
          userId: world.davi.userId,
        })
        expect(await send(database, world, 3)).toEqual([world.carla.address])

        await saveType(database, world, { contractorMailWatcherUserIds: [] })
        await world.watchers.setWatcherStatus({
          ...base,
          scope: company,
          status: 'active',
          userId: world.davi.userId,
        })
        await world.watchers.removeWatcher({
          ...base,
          scope: { ...company, contractorId: world.contractorId, kind: 'contractor' },
          userId: world.carla.userId,
        })
        expect(await send(database, world, 4)).toEqual([
          world.ana.address,
          world.bruno.address,
          world.davi.address,
        ])
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'o aviso automático e o reenvio do pedido de resposta (248) também levam a cópia do tipo',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        const { companyId } = world.seeded.company
        await saveType(database, world, {
          contractorMailWatcherUserIds: [world.davi.userId],
          emailsContractor: true,
        })
        await database.db
          .update(companyOccurrenceTypes)
          .set({
            contractorReplyAlertIntervalMinutes: 60,
            contractorReplyMode: 'forward_after_approval',
            contractorReplyWaitHours: 6,
            driverReplyTemplate: 'Segue o boleto prorrogado.',
          })
          .where(eq(companyOccurrenceTypes.id, world.typeId))

        const automatic = await createSendAutomaticOccurrenceMailUseCase({
          reader: createAutomaticOccurrenceMailReader(database.db),
          sendMail: createOccurrenceMailUseCase(database),
        }).send({
          companyId,
          correlationId: 'corr-auto',
          occurrenceId: world.seeded.occurrenceId,
        })
        expect(automatic).toMatchObject({ outcome: 'sent' })

        await createResendContractorReplyRequestUseCase({
          reader: createDrizzleContractorReplyResendReader(database.db),
          sendMail: createOccurrenceMailUseCase(database),
        }).resend({
          actorUserId: world.seeded.company.userId,
          companyId,
          correlationId: 'corr-resend',
          idempotencyKey: 'resend-1',
          occurrenceId: world.seeded.occurrenceId,
        })

        const mails = await database.db
          .select({ cc: contractorMailMessages.ccAddresses })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.companyId, companyId))
        expect(mails.map((mail) => mail.cc)).toEqual([[world.davi.address], [world.davi.address]])
      })
    },
    TEST_TIMEOUT_MS,
  )
})
