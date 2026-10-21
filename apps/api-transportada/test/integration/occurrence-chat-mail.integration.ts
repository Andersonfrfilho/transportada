/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T3.6 (ADR-0111, D5/D6/D11), contra Postgres real: o chat da contratante grava o e-mail, a mensagem da
 * conversa `queued` e a versão do modelo padrão (0 = embutido; a da empresa quando o renderer a devolve). A segunda
 * chamada com a mesma chave não duplica. Os casos de renderer usam o `StandardEmailService` REAL do pacote (sem dublê); os demais, um dublê da porta.
 */
import {
  renderStandardEmail,
  type StandardEmailTemplate,
} from '@adatechnology/notification-contracts'
import { StandardEmailService, TemplateRepository } from '@adatechnology/notification-module'
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailOutbox,
  occurrenceConversationMessages,
} from '../../src/database/database.schema.js'
import { createSendOccurrenceChatMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-chat-mail.use-case.js'
import type {
  ResolvedStandardEmailTemplate,
  StandardEmailRendered,
} from '../../src/occurrence-conversation/application/standard-email-renderer.port.js'
import { OccurrenceConversationIdempotencyKeyReusedError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { DrizzleOccurrenceMailRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 90_000
const TEMPLATE_KEY = 'notification.standard-email'

function render(version: number, source: 'builtin' | 'company'): StandardEmailRendered {
  return {
    bytes: 100,
    html: `<p>modelo v${version}</p>`,
    template: { key: TEMPLATE_KEY, source, version },
    text: `modelo v${version}`,
    tooLarge: false,
  }
}

function createUseCase(database: TestDatabase, rendered: StandardEmailRendered | undefined) {
  return createSendOccurrenceChatMailUseCase({
    fingerprintService: {
      create: async ({ fields, operation }) =>
        `${operation}|${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
    },
    now: () => new Date('2026-10-19T12:00:00.000Z'),
    renderer:
      rendered === undefined
        ? {
            render: ({ input, template }) =>
              renderStandardEmail({
                input,
                template: template as unknown as StandardEmailTemplate,
              }),
            resolve: async ({ companyId }) =>
              (await new StandardEmailService(
                new TemplateRepository(database.db as never),
              ).resolveTemplate({
                companyId,
                locale: 'pt-BR',
              })) as unknown as ResolvedStandardEmailTemplate,
          }
        : { render: () => rendered, resolve: async () => ({}) as ResolvedStandardEmailTemplate },
    secretService: {
      decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'c'.repeat(64) }),
    } as never,
    storage: {} as never,
    unitOfWork: new DrizzleOccurrenceMailRepository(database.db),
  })
}

function send(
  useCase: ReturnType<typeof createUseCase>,
  seeded: Seeded,
  overrides: { readonly bodyText?: string; readonly idempotencyKey?: string } = {},
) {
  return useCase.send({
    actorUserId: seeded.company.userId,
    bodyText: overrides.bodyText ?? '  Boa tarde, segue a nota.  ',
    companyId: seeded.company.companyId,
    correlationId: 'correlation-274-chat',
    idempotencyKey: overrides.idempotencyKey ?? 'email-message:chat-1',
    occurrenceId: seeded.occurrenceId,
  })
}

async function stored(database: TestDatabase, seeded: Seeded) {
  return database.db
    .select({
      bodyHtml: contractorMailMessages.bodyHtml,
      conversationText: occurrenceConversationMessages.bodyText,
      key: contractorMailMessages.notificationTemplateKey,
      status: occurrenceConversationMessages.status,
      subject: contractorMailMessages.subject,
      toAddresses: contractorMailMessages.toAddresses,
      version: contractorMailMessages.notificationTemplateVersion,
    })
    .from(contractorMailMessages)
    .innerJoin(
      occurrenceConversationMessages,
      eq(occurrenceConversationMessages.mailMessageId, contractorMailMessages.id),
    )
    .where(eq(contractorMailMessages.companyId, seeded.company.companyId))
}

describe('o chat da contratante contra Postgres (spec 274 T3.6)', () => {
  testWithPostgres(
    'sem linha do modelo na empresa: grava e-mail, mensagem na fila, outbox e a versão 0 (embutido)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)

        const result = await send(createUseCase(database, render(0, 'builtin')), seeded)

        expect(result.recipientCount).toBe(2)
        const rows = await stored(database, seeded)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          bodyHtml: '<p>modelo v0</p>',
          conversationText: 'Boa tarde, segue a nota.',
          key: TEMPLATE_KEY,
          status: 'queued',
          version: 0,
        })
        expect(rows[0]?.subject).toContain('Ocorrência Caixa violada')
        expect(rows[0]?.toAddresses).toEqual([
          'compras@alfa.example.test',
          'fiscal@alfa.example.test',
        ])
        const outbox = await database.db
          .select({ id: contractorMailOutbox.id })
          .from(contractorMailOutbox)
          .where(eq(contractorMailOutbox.messageId, result.mailMessageId))
        expect(outbox).toHaveLength(1)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'com versão da empresa: grava a versão dela',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)

        await send(createUseCase(database, render(4, 'company')), seeded)

        expect((await stored(database, seeded))[0]).toMatchObject({ key: TEMPLATE_KEY, version: 4 })
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a segunda chamada com a mesma chave não duplica; a mesma chave com outro texto é 409; a segunda mensagem mantém o assunto da linha',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const useCase = createUseCase(database, render(0, 'builtin'))

        const first = await send(useCase, seeded)
        const replay = await send(useCase, seeded)

        expect(replay).toEqual(first)
        expect(await stored(database, seeded)).toHaveLength(1)
        let reused: unknown
        try {
          await send(useCase, seeded, { bodyText: 'Outro texto' })
        } catch (error) {
          reused = error
        }
        expect(reused).toBeInstanceOf(OccurrenceConversationIdempotencyKeyReusedError)

        await send(useCase, seeded, { idempotencyKey: 'email-message:chat-2' })
        const rows = await stored(database, seeded)
        expect(rows).toHaveLength(2)
        expect(rows[1]?.subject).toBe(rows[0]?.subject ?? '')
        expect(rows[1]?.subject).not.toMatch(/^Re:/iu)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'com o renderer real do SDK e sem linha da chave: versão 0, texto escapado e rodapé no HTML',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)

        await send(createUseCase(database, undefined), seeded, {
          bodyText: 'Segue <b>a nota</b> & o canhoto.',
        })

        const rows = await stored(database, seeded)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ key: TEMPLATE_KEY, version: 0 })
        expect(rows[0]?.bodyHtml).toContain('Segue &lt;b&gt;a nota&lt;/b&gt; &amp; o canhoto.')
        expect(rows[0]?.bodyHtml).not.toContain('<b>a nota</b>')
        // O rodapé do HTML sai em pedaços (nomes em negrito ao lado das marcas); a frase inteira só vai no texto puro.
        expect(rows[0]?.bodyHtml).toContain('TransportAdA')
        expect(rows[0]?.bodyHtml).toContain('Ada Technology')
        expect(rows[0]?.bodyHtml).not.toContain('__ADA_PLATFORM_FOOTER__')
      })
    },
    TEST_TIMEOUT_MS,
  )
})
