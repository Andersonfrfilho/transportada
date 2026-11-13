/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 T1, contra Postgres real: o botão "Avisar a contratante" (`sendManual`) com o tipo desligado manda o mesmo
 * aviso que o automático mandaria — e-mail com o modelo do tipo aos contatos da etapa (CA03) ou o grupo da 318 sem
 * e-mail (CA02) —, uma vez só (CA04), sem tocar a reserva do automático; o automático continua `type_off` (CA01) e não
 * repete depois do botão; o tipo marcado pela 321 nunca avisa (CA05).
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorMailMessages,
  contractors,
  tripDocumentOccurrences,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY } from '../../src/occurrence-conversation/domain/contractor-occurrence-group.policy.js'
import { createContractorManualNoticeRepository } from '../../src/occurrence-conversation/infrastructure/contractor-manual-notice.repository.js'
import { createContractorOccurrenceGroupRepository } from '../../src/occurrence-conversation/infrastructure/contractor-occurrence-group.repository.js'
import { DrizzleContractorOccurrenceChannelRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-contractor-occurrence-channel.repository.js'
import { createAutomaticOccurrenceMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { seedNotificationTemplate } from '../fixtures/notification-template.fixture.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const GROUP_JID = '120363000000000324@g.us'
const MENTION_PHONE = '5516999990324'

type Post = { readonly body: string; readonly groupJid: string; readonly mentionNumber: string }

async function setType(
  database: TestDatabase,
  seeded: Seeded,
  values: { readonly blocksContractorNotice?: boolean; readonly emailsContractor: boolean },
): Promise<void> {
  const [occurrence] = await database.db
    .select({ typeId: tripDocumentOccurrences.occurrenceTypeId })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
  await database.db
    .update(companyOccurrenceTypes)
    .set(values)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, seeded.company.companyId),
        eq(companyOccurrenceTypes.id, occurrence?.typeId ?? ''),
      ),
    )
}

async function useGroup(database: TestDatabase, seeded: Seeded): Promise<void> {
  const { companyId, userId } = seeded.company
  const [contractor] = await database.db
    .select({ id: contractors.id })
    .from(contractors)
    .where(eq(contractors.companyId, companyId))
  await new DrizzleContractorOccurrenceChannelRepository(database.db).save({
    actorUserId: userId,
    channel: 'whatsapp_group',
    companyId,
    contractorId: contractor?.id ?? '',
    correlationId: 'corr-324',
    emailFallback: true,
    groupJid: GROUP_JID,
    groupName: 'Alfa — ocorrências',
    mentionPhone: MENTION_PHONE,
  })
  await seedNotificationTemplate(database, {
    body: 'Ocorrência na {{momento}} — NF {{numeroNota}}\nTipo: {{tipoOcorrencia}}',
    channel: 'whatsapp',
    companyId,
    key: CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY,
    subject: null,
  })
}

function notice(database: TestDatabase, posts: Post[]) {
  return createSendAutomaticOccurrenceMailUseCase({
    group: createContractorOccurrenceGroupRepository({
      database: database.db,
      send: async (input) => {
        posts.push(input)
        return { providerMessageId: 'evolution-324' }
      },
    }),
    manualNotice: createContractorManualNoticeRepository({ database: database.db }),
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
    sleep: async () => undefined,
  })
}

async function mails(database: TestDatabase, companyId: string) {
  return database.db
    .select({ actorUserId: contractorMailMessages.actorUserId })
    .from(contractorMailMessages)
    .where(eq(contractorMailMessages.companyId, companyId))
}

async function records(database: TestDatabase, seeded: Seeded) {
  return (await database.db.execute(
    sql`select operation, idempotency_key, status from idempotency_records
        where company_id = ${seeded.company.companyId}::uuid
          and idempotency_key like ${`%${seeded.occurrenceId}`}
        order by operation`,
  )) as unknown as readonly { idempotency_key: string; operation: string; status: string }[]
}

describe('o botão "Avisar a contratante" contra Postgres (spec 324 T1)', () => {
  testWithPostgres(
    'CA01/CA03/CA04: tipo desligado, contratante por e-mail — um e-mail do operador; o segundo clique e o automático não mandam',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { emailsContractor: false })
        const { companyId, userId } = seeded.company
        const useCase = notice(database, [])
        const input = { companyId, correlationId: 'c-324a', occurrenceId: seeded.occurrenceId }

        expect(await useCase.send(input)).toEqual({ outcome: 'skipped', reason: 'type_off' })
        expect(await useCase.sendManual({ ...input, actorUserId: userId })).toMatchObject({
          outcome: 'sent',
          recipientCount: 2,
        })
        expect(await useCase.sendManual({ ...input, actorUserId: userId })).toEqual({
          by: 'manual',
          outcome: 'already_notified',
        })

        expect(await mails(database, companyId)).toEqual([{ actorUserId: userId }])
        expect(await records(database, seeded)).toEqual([
          {
            idempotency_key: `occurrence-manual-notice:${seeded.occurrenceId}`,
            operation: 'occurrence-contractor-manual-notice.send',
            status: 'completed',
          },
          expect.objectContaining({
            idempotency_key: `occurrence-manual-notice:${seeded.occurrenceId}`,
            operation: 'occurrence-conversation.mail.send',
          }),
        ])

        // Ligar o tipo depois: a varredura do automático não repete o que o botão mandou.
        await setType(database, seeded, { emailsContractor: true })
        expect(await useCase.send(input)).toEqual({
          outcome: 'skipped',
          reason: 'manual_notice_sent',
        })
        expect(await mails(database, companyId)).toHaveLength(1)
      })
    },
    60_000,
  )

  testWithPostgres(
    'CA02: tipo desligado, contratante em grupo — posta no grupo pela chave do botão, nenhum e-mail',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { emailsContractor: false })
        await useGroup(database, seeded)
        const { companyId, userId } = seeded.company
        const posts: Post[] = []
        const input = { companyId, correlationId: 'c-324b', occurrenceId: seeded.occurrenceId }

        expect(await notice(database, posts).sendManual({ ...input, actorUserId: userId })).toEqual(
          {
            attempts: 1,
            outcome: 'sent_to_group',
          },
        )

        expect(posts).toHaveLength(1)
        expect(posts[0]?.groupJid).toBe(GROUP_JID)
        expect(posts[0]?.body).toContain('Tipo: Caixa violada')
        expect(await mails(database, companyId)).toEqual([])
        expect(
          (await records(database, seeded)).map((row) => [
            row.operation,
            row.idempotency_key.split(':')[0],
            row.status,
          ]),
        ).toEqual([
          ['occurrence-contractor-group.send', 'occurrence-manual-notice', 'completed'],
          ['occurrence-contractor-manual-notice.send', 'occurrence-manual-notice', 'completed'],
        ])
      })
    },
    60_000,
  )

  testWithPostgres(
    'D8: tipo ligado que o automático já avisou — o botão recusa sem reservar',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { emailsContractor: true })
        const { companyId, userId } = seeded.company
        const useCase = notice(database, [])
        const input = { companyId, correlationId: 'c-324c', occurrenceId: seeded.occurrenceId }

        expect((await useCase.send(input)).outcome).toBe('sent')
        expect(await useCase.sendManual({ ...input, actorUserId: userId })).toEqual({
          by: 'automatic',
          outcome: 'already_notified',
        })
        expect(await mails(database, companyId)).toEqual([{ actorUserId: null }])
        expect(
          (await records(database, seeded)).filter(
            (row) => row.operation === 'occurrence-contractor-manual-notice.send',
          ),
        ).toEqual([])
      })
    },
    60_000,
  )

  testWithPostgres(
    'CA05: tipo marcado pela 321 (canhoto retido) — bloqueado, nada sai e nada é reservado',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setType(database, seeded, { blocksContractorNotice: true, emailsContractor: false })
        const { companyId, userId } = seeded.company

        expect(
          await notice(database, []).sendManual({
            actorUserId: userId,
            companyId,
            correlationId: 'c-324d',
            occurrenceId: seeded.occurrenceId,
          }),
        ).toEqual({ outcome: 'blocked' })
        expect(await mails(database, companyId)).toEqual([])
        expect(await records(database, seeded)).toEqual([])
      })
    },
    60_000,
  )
})
