/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318, contra Postgres real: a contratante com canal "WhatsApp (grupo)" recebe o aviso automático da ocorrência
 * no grupo e nenhum e-mail; reprocessar não duplica (RF3); a falha cai no e-mail de reserva e fica registrada na linha
 * do tempo (RF6); o texto sai do módulo de notificação sem dado sensível (RF4); e um grupo nunca é de um motorista e de
 * uma contratante ao mesmo tempo (RF5), também sob concorrência.
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorMailMessages,
  contractors,
  nfeDocuments,
  nfeParticipants,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { FleetDriverWhatsappGroupTakenByContractorError } from '../../src/fleet/domain/fleet.error.js'
import { DrizzleDriverWhatsappGroupRepository } from '../../src/fleet/infrastructure/drizzle-driver-whatsapp-group.repository.js'
import { DrizzleFleetDriverRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver.repository.js'
import { ContractorReplyWhatsAppSendError } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { ContractorOccurrenceGroupTakenError } from '../../src/occurrence-conversation/domain/contractor-occurrence-channel.error.js'
import { CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY } from '../../src/occurrence-conversation/domain/contractor-occurrence-group.policy.js'
import { createContractorOccurrenceGroupRepository } from '../../src/occurrence-conversation/infrastructure/contractor-occurrence-group.repository.js'
import { DrizzleContractorOccurrenceChannelRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-occurrence-channel.repository.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
import { DRIVER_FIELDS } from '../fixtures/fleet-http-payload.fixture.js'
import { seedNotificationTemplate } from '../fixtures/notification-template.fixture.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const GROUP_JID = '120363000000000318@g.us'
const MENTION_PHONE = '5516999990318'
const EMITTER_TAX_ID = '11222333000181'

type Post = { readonly body: string; readonly groupJid: string; readonly mentionNumber: string }

async function contractorOf(database: TestDatabase, seeded: Seeded): Promise<string> {
  const [row] = await database.db
    .select({ id: contractors.id })
    .from(contractors)
    .where(eq(contractors.companyId, seeded.company.companyId))
  if (row === undefined) throw new Error('EXPECTED_CONTRACTOR')
  return row.id
}

async function prepare(
  database: TestDatabase,
  input: { readonly emailFallback?: boolean } = {},
): Promise<Seeded> {
  const seeded = await seedMailScenario(database)
  const { companyId, userId } = seeded.company
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set({ emailsContractor: true })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
  const [emitter] = await database.db
    .select({ documentId: nfeParticipants.documentId })
    .from(nfeParticipants)
    .where(and(eq(nfeParticipants.companyId, companyId), eq(nfeParticipants.role, 'emitter')))
  const nfeDocumentId = emitter?.documentId ?? ''
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId: nfeDocumentId,
    id: crypto.randomUUID(),
    legalName: 'Cliente Beta Ltda',
    role: 'recipient',
    taxId: '99888777000155',
  })
  await database.db
    .update(nfeDocuments)
    .set({ totalValue: '1250.00' })
    .where(eq(nfeDocuments.id, nfeDocumentId))
  await new DrizzleContractorOccurrenceChannelRepository(database.db).save({
    actorUserId: userId,
    channel: 'whatsapp_group',
    companyId,
    contractorId: await contractorOf(database, seeded),
    correlationId: 'corr-318',
    emailFallback: input.emailFallback ?? true,
    groupJid: GROUP_JID,
    groupName: 'Única — ocorrências',
    mentionPhone: MENTION_PHONE,
  })
  await seedNotificationTemplate(database, {
    body: '⚠️ Ocorrência na {{momento}} — NF {{numeroNota}}\nTipo: {{tipoOcorrencia}}\nContratante: {{contratante}}\nCliente: {{cliente}}\nValor da nota: R$ {{valorNota}}\n📅 *Vencimento pedido:* {{novaData}}\nCNPJ: {{cnpjContratante}}\n📝 {{observacao}}',
    channel: 'whatsapp',
    companyId,
    key: CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY,
    subject: null,
  })
  return seeded
}

function automaticNotice(
  database: TestDatabase,
  posts: Post[],
  failures: ContractorReplyWhatsAppSendError[] = [],
) {
  return createSendAutomaticOccurrenceMailUseCase({
    group: createContractorOccurrenceGroupRepository({
      database: database.db,
      send: async (input) => {
        posts.push(input)
        const failure = failures.shift()
        if (failure !== undefined) throw failure
        return { providerMessageId: 'evolution-1' }
      },
    }),
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
    sleep: async () => undefined,
  })
}

async function mailCount(database: TestDatabase, companyId: string): Promise<number> {
  const rows = await database.db
    .select({ id: contractorMailMessages.id })
    .from(contractorMailMessages)
    .where(eq(contractorMailMessages.companyId, companyId))
  return rows.length
}

async function groupRecord(database: TestDatabase, seeded: Seeded) {
  const rows = (await database.db.execute(
    sql`select status, response from idempotency_records
        where company_id = ${seeded.company.companyId}::uuid
          and operation = 'occurrence-contractor-group.send'
          and idempotency_key = ${`occurrence-auto-mail:${seeded.occurrenceId}`}`,
  )) as unknown as readonly { response: Record<string, unknown>; status: string }[]
  return rows
}

describe('o aviso da ocorrência no grupo da contratante contra Postgres (spec 318)', () => {
  testWithPostgres(
    'posta no grupo marcando o número, sem e-mail; reprocessar não duplica; a linha do tempo mostra',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await prepare(database)
        const { companyId } = seeded.company
        const posts: Post[] = []
        const notice = automaticNotice(database, posts)
        const input = { companyId, correlationId: 'c-318', occurrenceId: seeded.occurrenceId }

        expect(await notice.send(input)).toEqual({ attempts: 1, outcome: 'sent_to_group' })
        expect(await notice.send(input)).toEqual({
          outcome: 'skipped',
          reason: 'group_already_sent',
        })

        expect(posts).toHaveLength(1)
        expect(posts[0]?.groupJid).toBe(GROUP_JID)
        expect(posts[0]?.mentionNumber).toBe(MENTION_PHONE)
        const body = posts[0]?.body ?? ''
        expect(body.startsWith(`@${MENTION_PHONE}\n`)).toBe(true)
        expect(body).toContain('Ocorrência na separação')
        expect(body).toContain('Tipo: Caixa violada')
        expect(body).toContain('📝 caixa com avaria visível')
        // RF4 (emenda de 11/11/2026): contratante, cliente e valor entram; CNPJ nunca, e a linha da data some
        expect(body).toContain('Contratante: Contratante Alfa')
        expect(body).toContain('Cliente: Cliente Beta Ltda')
        expect(body).toContain('Valor da nota: R$ 1.250,00')
        expect(body).not.toContain(EMITTER_TAX_ID)
        expect(body).not.toContain('Vencimento pedido')
        expect(body.trim().endsWith('caixa com avaria visível')).toBe(true)

        expect(await mailCount(database, companyId)).toBe(0)
        expect(await groupRecord(database, seeded)).toEqual([
          { response: { attempts: 1, failure: null, status: 'sent' }, status: 'completed' },
        ])

        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(sources?.filter((source) => source.kind === 'contractor.group.whatsapp')).toEqual([
          expect.objectContaining({ reason: null, status: 'sent' }),
        ])
      })
    },
    60_000,
  )

  testWithPostgres(
    'P2: o grupo falha e cai no e-mail de reserva, uma vez só, registrado na linha do tempo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await prepare(database)
        const { companyId } = seeded.company
        const posts: Post[] = []
        const notice = automaticNotice(database, posts, [
          new ContractorReplyWhatsAppSendError('number_not_found'),
        ])
        const input = { companyId, correlationId: 'c-318b', occurrenceId: seeded.occurrenceId }

        expect(await notice.send(input)).toMatchObject({
          failure: 'group_not_found',
          fallback: { outcome: 'sent' },
          outcome: 'group_failed',
        })
        expect(await notice.send(input)).toEqual({
          outcome: 'skipped',
          reason: 'group_already_sent',
        })

        expect(posts).toHaveLength(1)
        expect(await mailCount(database, companyId)).toBe(1)
        expect(await groupRecord(database, seeded)).toEqual([
          {
            response: { attempts: 1, failure: 'group_not_found', status: 'email_fallback' },
            status: 'completed',
          },
        ])
        const sources = await findTripOccurrenceTimelineSources(database.db, {
          companyId,
          occurrenceId: seeded.occurrenceId,
        })
        expect(sources?.filter((source) => source.kind === 'contractor.group.whatsapp')).toEqual([
          expect.objectContaining({ reason: 'group_not_found', status: 'email_fallback' }),
        ])
      })
    },
    60_000,
  )

  testWithPostgres(
    'reserva desligada: nada sai, fica `failed`, e a próxima tentativa (varredura) posta',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await prepare(database, { emailFallback: false })
        const { companyId } = seeded.company
        const posts: Post[] = []
        const notice = automaticNotice(database, posts, [
          new ContractorReplyWhatsAppSendError('disconnected'),
        ])
        const input = { companyId, correlationId: 'c-318c', occurrenceId: seeded.occurrenceId }

        expect(await notice.send(input)).toEqual({
          failure: 'disconnected',
          fallback: null,
          outcome: 'group_failed',
        })
        expect((await groupRecord(database, seeded))[0]?.status).toBe('failed')

        expect(await notice.send(input)).toEqual({ attempts: 1, outcome: 'sent_to_group' })
        expect(posts).toHaveLength(2)
        expect(await mailCount(database, companyId)).toBe(0)
        expect((await groupRecord(database, seeded))[0]?.status).toBe('completed')
      })
    },
    60_000,
  )

  testWithPostgres(
    'contratante voltando ao e-mail: o aviso sai por e-mail como antes',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await prepare(database)
        const { companyId, userId } = seeded.company
        await new DrizzleContractorOccurrenceChannelRepository(database.db).save({
          actorUserId: userId,
          channel: 'email',
          companyId,
          contractorId: await contractorOf(database, seeded),
          correlationId: 'corr-318-email',
          emailFallback: true,
        })
        const posts: Post[] = []

        expect(
          await automaticNotice(database, posts).send({
            companyId,
            correlationId: 'c-318d',
            occurrenceId: seeded.occurrenceId,
          }),
        ).toMatchObject({ outcome: 'sent' })
        expect(posts).toEqual([])
        expect(await mailCount(database, companyId)).toBe(1)
      })
    },
    60_000,
  )
})

describe('o grupo tem um dono só, motorista ou contratante (spec 318 RF5)', () => {
  async function setUp(database: TestDatabase) {
    const seeded = await seedMailScenario(database)
    const { companyId, userId } = seeded.company
    const contractorId = await contractorOf(database, seeded)
    const driver = await new DrizzleFleetDriverRepository(database.db).create({
      canDrive: true,
      companyId,
      driver: {
        ...DRIVER_FIELDS,
        licenseNumber: '31831831831',
        membershipId: null,
        taxId: '31831831831',
      },
    })
    const channels = new DrizzleContractorOccurrenceChannelRepository(database.db)
    const driverGroups = new DrizzleDriverWhatsappGroupRepository(database.db)
    const saveContractor = () =>
      channels.save({
        actorUserId: userId,
        channel: 'whatsapp_group',
        companyId,
        contractorId,
        correlationId: 'c',
        emailFallback: true,
        groupJid: GROUP_JID,
        groupName: '',
        mentionPhone: MENTION_PHONE,
      })
    const saveDriver = () =>
      driverGroups.set({
        actorUserId: userId,
        companyId,
        correlationId: 'c',
        driverId: driver.id,
        groupJid: GROUP_JID,
        groupName: '',
      })
    return { channels, companyId, contractorId, saveContractor, saveDriver, userId }
  }

  testWithPostgres(
    'grupo de motorista não vira canal de contratante, e o contrário também não',
    async () => {
      await withConversationDatabase(async (database) => {
        const first = await setUp(database)
        await first.saveDriver()
        await expect(first.saveContractor()).rejects.toBeInstanceOf(
          ContractorOccurrenceGroupTakenError,
        )

        const second = await setUp(database)
        await second.saveContractor()
        await expect(second.saveDriver()).rejects.toBeInstanceOf(
          FleetDriverWhatsappGroupTakenByContractorError,
        )
        // a lista de donos mostra a contratante
        expect(await second.channels.listOwners({ companyId: second.companyId })).toEqual([
          expect.objectContaining({ groupJid: GROUP_JID, kind: 'contractor' }),
        ])
        // voltar ao e-mail libera o grupo
        await second.channels.save({
          actorUserId: second.userId,
          channel: 'email',
          companyId: second.companyId,
          contractorId: second.contractorId,
          correlationId: 'c',
          emailFallback: true,
        })
        await second.saveDriver()
      })
    },
    60_000,
  )

  testWithPostgres(
    'disputa simultânea entre motorista e contratante: só um fica com o grupo',
    async () => {
      await withConversationDatabase(async (database) => {
        const { saveContractor, saveDriver } = await setUp(database)
        const outcome = (promise: Promise<unknown>) =>
          promise
            .then(() => 'ok' as const)
            .catch((error: unknown) =>
              error instanceof ContractorOccurrenceGroupTakenError ||
              error instanceof FleetDriverWhatsappGroupTakenByContractorError
                ? ('taken' as const)
                : Promise.reject(error),
            )

        const results = await Promise.all([outcome(saveContractor()), outcome(saveDriver())])

        expect(results.sort()).toEqual(['ok', 'taken'])
      })
    },
    60_000,
  )
})
