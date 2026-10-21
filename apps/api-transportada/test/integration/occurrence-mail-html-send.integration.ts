/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.4 (ADR-0110 §1, §3, §4, §7, §8, §12), contra Postgres real: o envio do e-mail da ocorrência com modelo
 * HTML e com modelo de texto, manual e automático, nos transportes Resend e sandbox. A mensagem gravada leva o HTML do
 * modelo, o texto gerado dele, o nome do "De" e se o logo vai embutido; a conversa leva o texto da área de mensagem.
 */
import { describe, expect } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

import {
  contractorMailMessages,
  contractorMailSettings,
  nfeProducts,
  occurrenceConversationMessages,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import { createSendOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import {
  createAutomaticOccurrenceMailReader,
  createOccurrenceMailReader,
  DrizzleOccurrenceMailRepository,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { createPreviewOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/preview-occurrence-mail.use-case.js'
import { createOccurrenceSuggestedMailReader } from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import { htmlToPlainText } from '../../src/occurrence-conversation/domain/occurrence-mail-plain-text.policy.js'
import type { OccurrenceOwnerReader } from '../../src/occurrence-conversation/application/occurrence-owner-reader.port.js'
import {
  SEEDED_NOTIFICATION_TEMPLATE_KEY,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import type { Seeded } from '../fixtures/occurrence-conversation-database.fixture.js'
import { testWithPostgres } from '../fixtures/trip-field-office-database.fixture.js'
import type { TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const TEST_TIMEOUT_MS = 90_000
const SANDBOX_SENDER = 'no-reply@staging.example.test'
const CARRIER_CNPJ = '11444777000161'
const SUBJECT_PREFIX = 'Tapete Mágico Transportes · CNPJ 11.444.777/0001-61 — '

const HTML_TEMPLATE = [
  '<html><body>',
  '<div>{{logoTransportadora}} <b>{{nomeExibicao}}</b> CNPJ {{cnpjTransportadora}} · {{cnpjContratante}}</div>',
  '<!-- mensagem -->',
  '<p>Prezados, a NF {{numeroNota}} teve a ocorrência {{tipoOcorrencia}}: {{observacao}}</p>',
  '<!-- /mensagem -->',
  '{{tabelaItens}}',
  '{{faixaResposta}}',
  '<p>{{assinaturaNome}} — {{assinaturaCargo}}</p>',
  '{{marcasRodape}}',
  '</body></html>',
].join('\n')
const HTML_SUBJECT = 'Avaria no transporte — NF {{numeroNota}}'
const TEXT_TEMPLATE = 'Ocorrência na nota {{numeroNota}}: {{observacao}}\n\nObrigado.'

async function seedCarrier(
  database: TestDatabase,
  seeded: Seeded,
  options: { readonly logo: boolean },
): Promise<void> {
  const { companyId, userId } = seeded.company
  await database.db.execute(sql`
    insert into company_fiscal_profiles
      (company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
       tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
       city_ibge_code, phone, email)
    values (
      ${companyId}, 'Tapete Mágico Transportes Ltda', 'Tapete Mágico Transportes', ${CARRIER_CNPJ},
      'isento', '', '1', '', 'Rua da Empresa', '1', '', 'Centro', 'Ribeirão Preto', 'SP', '14000000',
      '3543402', '', ''
    )
  `)
  if (options.logo) {
    await database.db.execute(sql`
      insert into company_logos (company_id, mime_type, content_base64, byte_size, sha256)
      values (${companyId}, 'image/png', 'AAAA', 3, ${'a'.repeat(64)})
    `)
  }
  await database.db.execute(sql`
    insert into identity_user_profiles (user_id, name, username, contact_channel, contact_address)
    values (${userId}, 'Ana Lima', ${`user-${userId}`}, 'email', 'ana@transportada.test')
  `)
  await database.db.execute(sql`
    update user_company_memberships set job_title = 'Atendimento — ocorrências'
    where user_id = ${userId} and company_id = ${companyId}
  `)
}

async function setTemplate(
  database: TestDatabase,
  seeded: Seeded,
  template: { readonly body: string; readonly subject: string },
): Promise<void> {
  await database.db.execute(sql`
    update notification.templates set body = ${template.body}, subject = ${template.subject}
    where company_id = ${seeded.company.companyId}::uuid and key = ${SEEDED_NOTIFICATION_TEMPLATE_KEY}
  `)
  await database.db.execute(sql`
    update company_occurrence_types set emails_contractor = true
    where company_id = ${seeded.company.companyId}::uuid
  `)
}

async function useSandboxTransport(database: TestDatabase, seeded: Seeded): Promise<void> {
  await database.db
    .delete(contractorMailSettings)
    .where(eq(contractorMailSettings.companyId, seeded.company.companyId))
}

function createUseCase(
  database: TestDatabase,
  options: { readonly ownerReader?: OccurrenceOwnerReader; readonly sandbox?: boolean } = {},
) {
  return createSendOccurrenceMailUseCase({
    appBaseUrl: 'https://app.example.test',
    ...(options.sandbox === true ? { contractorMailSandbox: { fromAddress: SANDBOX_SENDER } } : {}),
    ...(options.ownerReader === undefined ? {} : { ownerReader: options.ownerReader }),
    fingerprintService: {
      create: async ({ fields }) =>
        fields.map((field) => new TextDecoder().decode(field)).join('|'),
    },
    now: () => new Date('2026-10-18T12:00:00.000Z'),
    secretService: {
      decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'b'.repeat(64) }),
    } as never,
    storage: {} as never,
    unitOfWork: new DrizzleOccurrenceMailRepository(database.db),
  })
}

function sendAutomatic(
  database: TestDatabase,
  seeded: Seeded,
  options?: Parameters<typeof createUseCase>[1],
) {
  return createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createUseCase(database, options),
  }).send({
    companyId: seeded.company.companyId,
    correlationId: 'correlation-272-auto',
    occurrenceId: seeded.occurrenceId,
  })
}

async function previewOf(database: TestDatabase, seeded: Seeded, bodyText?: string) {
  return createPreviewOccurrenceMailUseCase({
    appBaseUrl: 'https://app.example.test',
    reader: createOccurrenceMailReader(database.db),
    suggestedMail: createOccurrenceSuggestedMailReader(database.db),
  }).preview({
    actorUserId: seeded.company.userId,
    ...(bodyText === undefined ? {} : { bodyText }),
    companyId: seeded.company.companyId,
    occurrenceId: seeded.occurrenceId,
  })
}

async function sendManual(
  database: TestDatabase,
  seeded: Seeded,
  input: { readonly bodyText: string; readonly subject: string },
  options?: Parameters<typeof createUseCase>[1],
) {
  return createUseCase(database, options).send({
    actorUserId: seeded.company.userId,
    bodyText: input.bodyText,
    companyId: seeded.company.companyId,
    contactIds: seeded.contactIds.slice(0, 1),
    correlationId: 'correlation-272-manual',
    idempotencyKey: `manual-${crypto.randomUUID()}`,
    occurrenceId: seeded.occurrenceId,
    subject: input.subject,
  })
}

async function stored(database: TestDatabase, seeded: Seeded) {
  const rows = await database.db
    .select({
      bodyHtml: contractorMailMessages.bodyHtml,
      bodyText: contractorMailMessages.bodyText,
      conversationText: occurrenceConversationMessages.bodyText,
      fromAddress: contractorMailMessages.fromAddress,
      fromDisplayName: contractorMailMessages.fromDisplayName,
      hasInlineLogo: contractorMailMessages.hasInlineLogo,
      subject: contractorMailMessages.subject,
      transport: contractorMailMessages.transport,
    })
    .from(contractorMailMessages)
    .innerJoin(
      occurrenceConversationMessages,
      eq(occurrenceConversationMessages.mailMessageId, contractorMailMessages.id),
    )
    .where(eq(contractorMailMessages.companyId, seeded.company.companyId))
  return rows.map((row) => ({ ...row, bodyHtml: row.bodyHtml ?? '' }))
}

describe('o envio com modelo HTML contra Postgres (spec 272 T2.4)', () => {
  testWithPostgres(
    'automático, Resend: o HTML do modelo com a observação escapada, o texto gerado, o "De" e o logo embutido (critérios 1, 5, 7)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await seedCarrier(database, seeded, { logo: true })
        await database.db
          .update(tripDocumentOccurrences)
          .set({ note: '<b>x</b> & "y"' })
          .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
        await setTemplate(database, seeded, { body: HTML_TEMPLATE, subject: HTML_SUBJECT })

        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })

        const [mail] = await stored(database, seeded)
        expect(mail).toMatchObject({
          fromAddress: 'ocorrencias@transportadora.example.test',
          fromDisplayName: 'Tapete Mágico Transportes',
          hasInlineLogo: true,
          transport: 'resend',
        })
        expect(mail?.subject).toMatch(
          new RegExp(`^${SUBJECT_PREFIX.replaceAll('.', '\\.')}Avaria no transporte — NF `, 'u'),
        )
        expect(mail?.bodyHtml).toContain('cid:company-logo')
        expect(mail?.bodyHtml).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;')
        expect(mail?.bodyHtml).not.toContain('<b>x</b>')
        expect(mail?.bodyHtml).toContain('<b>Tapete Mágico Transportes</b> CNPJ 11.444.777/0001-61')
        expect(mail?.bodyHtml).toContain('Responda este e-mail')
        expect(mail?.bodyHtml).toContain('<p>Equipe Tapete Mágico Transportes — </p>')
        expect(mail?.bodyHtml).toContain('https://app.example.test/icons/icon-192.png')
        expect(mail?.bodyText).toBe(htmlToPlainText(mail?.bodyHtml ?? ''))
        expect(mail?.bodyText).not.toMatch(/<(?:html|div|p|table|td|img)\b/u)
        expect(mail?.bodyText).toContain('<b>x</b> & "y"')
        expect(mail?.conversationText).toContain('teve a ocorrência Caixa violada: <b>x</b> & "y"')
        expect(mail?.conversationText).not.toContain('CNPJ')
        expect(mail?.conversationText).not.toContain('Equipe')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'automático, sandbox: o nome no "De", as duas partes e nenhuma faixa de resposta (critério 8)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await seedCarrier(database, seeded, { logo: false })
        await setTemplate(database, seeded, { body: HTML_TEMPLATE, subject: HTML_SUBJECT })
        await useSandboxTransport(database, seeded)

        expect(await sendAutomatic(database, seeded, { sandbox: true })).toMatchObject({
          outcome: 'sent',
        })

        const [mail] = await stored(database, seeded)
        expect(mail).toMatchObject({
          fromAddress: SANDBOX_SENDER,
          fromDisplayName: 'Tapete Mágico Transportes',
          hasInlineLogo: false,
          transport: 'sandbox_smtp',
        })
        expect(mail?.bodyHtml).not.toContain('Responda este e-mail')
        expect(mail?.bodyHtml).not.toContain('cid:')
        expect(mail?.bodyHtml).toContain('>TM<')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'manual, Resend: texto mantido leva a área do modelo; editado leva o texto do operador escapado; "De" e assinatura do operador (critérios 6, 9)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await seedCarrier(database, seeded, { logo: true })
        await setTemplate(database, seeded, { body: HTML_TEMPLATE, subject: HTML_SUBJECT })

        const preview = await previewOf(database, seeded)
        expect(preview.bodyText).toContain('teve a ocorrência Caixa violada')
        expect(preview.html).toContain('<p>Ana Lima — Atendimento — ocorrências</p>')
        expect(preview.subject).toMatch(/^Avaria no transporte — NF /u)

        await sendManual(database, seeded, { bodyText: preview.bodyText, subject: preview.subject })
        await sendManual(database, seeded, {
          bodyText: 'Segue <b>outro</b> texto & mais.',
          subject: preview.subject,
        })

        const mails = await stored(database, seeded)
        expect(mails).toHaveLength(2)
        const kept = mails.find((mail) => mail.bodyHtml.includes('teve a ocorrência'))
        const edited = mails.find((mail) => mail.bodyHtml.includes('Segue &lt;b&gt;'))
        expect(kept).toBeDefined()
        expect(edited).toBeDefined()
        for (const mail of mails) {
          expect(mail.fromDisplayName).toBe('Ana Lima — Tapete Mágico Transportes')
          expect(mail.bodyHtml).toContain('<p>Ana Lima — Atendimento — ocorrências</p>')
          expect(mail.bodyHtml).toContain('<b>Tapete Mágico Transportes</b>')
          expect(mail.hasInlineLogo).toBe(true)
          expect(mail.bodyText).toBe(htmlToPlainText(mail.bodyHtml))
          expect(mail.bodyText).not.toMatch(/<(?:html|div|p|table|td|img)\b/u)
        }
        expect(edited?.bodyHtml).not.toContain('<b>outro</b>')
        expect(edited?.bodyHtml).not.toContain('teve a ocorrência')
        expect(edited?.conversationText).toBe('Segue <b>outro</b> texto & mais.')
        expect(kept?.conversationText).toBe(preview.bodyText)
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'manual, sandbox: o nome do operador no "De" e o HTML do modelo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await seedCarrier(database, seeded, { logo: false })
        await setTemplate(database, seeded, { body: HTML_TEMPLATE, subject: HTML_SUBJECT })
        await useSandboxTransport(database, seeded)

        await sendManual(
          database,
          seeded,
          { bodyText: 'Texto do operador.', subject: 'Avaria' },
          { sandbox: true },
        )

        const [mail] = await stored(database, seeded)
        expect(mail).toMatchObject({
          fromAddress: SANDBOX_SENDER,
          fromDisplayName: 'Ana Lima — Tapete Mágico Transportes',
          subject: `${SUBJECT_PREFIX}Avaria`,
          transport: 'sandbox_smtp',
        })
        expect(mail?.bodyHtml).toContain('Texto do operador.')
        expect(mail?.bodyHtml).toContain('<b>Tapete Mágico Transportes</b>')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a fonte HTML relida é reavaliada: modelo que virou inseguro depois da avaliação não vira fonte (revisão A7)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await setTemplate(database, seeded, { body: HTML_TEMPLATE, subject: HTML_SUBJECT })
        const reader = createOccurrenceMailReader(database.db)
        const params = {
          companyId: seeded.company.companyId,
          occurrenceId: seeded.occurrenceId,
          templateKey: SEEDED_NOTIFICATION_TEMPLATE_KEY,
        }

        expect(await reader.findOccurrenceMailHtmlSource(params)).not.toBeNull()

        await setTemplate(database, seeded, {
          body: HTML_TEMPLATE.replace('<html>', '<html><script>x()</script>'),
          subject: HTML_SUBJECT,
        })

        expect(await reader.findOccurrenceMailHtmlSource(params)).toBeNull()
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'com o dono injetado na porta, o automático sai em nome dele (critério 12)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await seedCarrier(database, seeded, { logo: false })
        await setTemplate(database, seeded, { body: HTML_TEMPLATE, subject: HTML_SUBJECT })

        await sendAutomatic(database, seeded, {
          ownerReader: {
            findEligibleOwner: async () => ({ name: 'Carla', userId: crypto.randomUUID() }),
          },
        })

        const [mail] = await stored(database, seeded)
        expect(mail?.fromDisplayName).toBe('Carla — Tapete Mágico Transportes')
        expect(mail?.bodyHtml).toContain('<p>Carla — </p>')
      })
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    '200 itens com {{linhasItens}} na área: a conversa grava até 8000, o e-mail leva o texto inteiro e o HTML cabe no CHECK do banco',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        await seedCarrier(database, seeded, { logo: false })
        const [document] = await database.db
          .select({
            documentId: tripDocuments.nfeDocumentId,
            tripDocumentId: tripDocuments.id,
          })
          .from(tripDocumentOccurrences)
          .innerJoin(tripDocuments, eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId))
          .where(eq(tripDocumentOccurrences.id, seeded.occurrenceId))
        if (document?.documentId === null || document === undefined) throw new Error('DOCUMENT')
        const codes = Array.from({ length: 200 }, (_, index) => `COD${index}`)
        await database.db.insert(nfeProducts).values(
          codes.map((code, index) => ({
            cfop: '5102',
            code,
            commercialUnit: 'UN',
            companyId: seeded.company.companyId,
            description: `Item de teste número ${index} com descrição longa para encher a linha`,
            documentId: document.documentId as string,
            ncm: '19053100',
            ordinal: BigInt(index + 1),
            quantity: '10.0000',
            totalValue: '1234.5600',
            unitValue: '123.4560',
          })),
        )
        await database.db.insert(tripDocumentOccurrenceProducts).values(
          codes.map((code, index) => ({
            companyId: seeded.company.companyId,
            occurrenceId: seeded.occurrenceId,
            position: index + 1,
            productCode: code,
          })),
        )
        await setTemplate(database, seeded, {
          body: HTML_TEMPLATE.replace('{{observacao}}', '{{linhasItens}}'),
          subject: HTML_SUBJECT,
        })

        const preview = await previewOf(database, seeded)
        expect(preview.bodyText.length).toBeLessThanOrEqual(8000)
        await sendManual(database, seeded, { bodyText: preview.bodyText, subject: preview.subject })
        expect(await sendAutomatic(database, seeded)).toMatchObject({ outcome: 'sent' })

        const mails = await stored(database, seeded)
        expect(mails).toHaveLength(2)
        for (const mail of mails) {
          expect(mail.conversationText.length).toBeLessThanOrEqual(8000)
          expect(mail.bodyText.length).toBeGreaterThan(8000)
          expect(mail.bodyHtml).toContain('COD199')
          expect(Buffer.byteLength(mail.bodyHtml, 'utf8')).toBeLessThanOrEqual(524288)
        }
      })
    },
    TEST_TIMEOUT_MS,
  )
})

describe('o envio com modelo de texto contra Postgres (spec 272 T2.4, critério 4)', () => {
  testWithPostgres(
    'automático e manual, Resend e sandbox: sai como hoje, com o prefixo no assunto e o "De" novo',
    async () => {
      for (const sandbox of [false, true]) {
        await withConversationDatabase(async (database) => {
          const seeded = await seedMailScenario(database)
          await seedCarrier(database, seeded, { logo: true })
          await setTemplate(database, seeded, {
            body: TEXT_TEMPLATE,
            subject: 'Ocorrência — NF {{numeroNota}}',
          })
          if (sandbox) await useSandboxTransport(database, seeded)

          expect(await sendAutomatic(database, seeded, { sandbox })).toMatchObject({
            outcome: 'sent',
          })
          await sendManual(
            database,
            seeded,
            { bodyText: 'Segue a ocorrência.', subject: 'Ocorrência' },
            { sandbox },
          )

          const mails = await stored(database, seeded)
          expect(mails).toHaveLength(2)
          const automatic = mails.find(
            (mail) => mail.fromDisplayName === 'Tapete Mágico Transportes',
          )
          const manual = mails.find(
            (mail) => mail.fromDisplayName === 'Ana Lima — Tapete Mágico Transportes',
          )
          expect(automatic?.subject).toMatch(
            new RegExp(`^${SUBJECT_PREFIX.replaceAll('.', '\\.')}Ocorrência — NF `, 'u'),
          )
          expect(automatic?.bodyText).toMatch(/\n\n--\nTapete Mágico Transportes$/u)
          expect(manual?.subject).toBe(`${SUBJECT_PREFIX}Ocorrência`)
          expect(manual?.bodyText).toBe(
            'Segue a ocorrência.\n\n--\nAna Lima\nTapete Mágico Transportes',
          )
          for (const mail of mails) {
            expect(mail.hasInlineLogo).toBe(false)
            expect(mail.bodyHtml).toContain('<p>')
            expect(mail.bodyHtml).not.toContain('cid:')
            expect(mail.transport).toBe(sandbox ? 'sandbox_smtp' : 'resend')
          }
        })
      }
    },
    TEST_TIMEOUT_MS * 2,
  )

  testWithPostgres(
    'empresa sem perfil fiscal: assunto sem prefixo e "De" nulo',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)

        await sendManual(database, seeded, { bodyText: 'Segue.', subject: 'Ocorrência' })

        const [mail] = await stored(database, seeded)
        expect(mail).toMatchObject({ fromDisplayName: null, subject: 'Ocorrência' })
      })
    },
    TEST_TIMEOUT_MS,
  )
})
