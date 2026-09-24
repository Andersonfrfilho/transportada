/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  CONTRACTOR_MAIL_TEMPLATE_LIMITS,
  CONTRACTOR_MAIL_TEMPLATE_STATUSES,
  CONTRACTOR_MAIL_TEMPLATE_TYPES,
  type ContractorMailTemplateStatus,
  type ContractorMailTemplateType,
} from '../contractor-mail/domain/mail-template-catalog.constant.js'
import { companies, identityUsers } from './identity.schema.js'
import { contractors } from './delivery-client.schema.js'
import { storedObjects } from './storage.schema.js'
import { inList } from './schema-check.constant.js'
import { WHATSAPP_PHONE_PATTERN } from '../whatsapp-commands/domain/whatsapp-phone.policy.js'

/**
 * Spec 143 (ADR-0063): a configuração é por empresa. A chave de API do Resend e o segredo do
 * webhook vivem selados juntos em `secret_envelope`, como em `nfse_provider_credentials` — nunca em
 * coluna legível. `webhook_id` é o segmento opaco de `POST /public/inbound-emails/<webhookId>`, e é
 * ele (não `company_id`) que a rota anônima usa para achar esta linha.
 *
 * `status` acompanha a lista de verificação do RF12: `pending` até o primeiro round-trip de teste
 * fechar, `active` quando ele fecha, `failed` quando algo que já funcionou para de funcionar.
 * Spec 150 RF16: `status` segue sendo "ida e volta completas" e não bloqueia mais o envio — quem
 * libera é `sending_verified_at` (chave aceita + domínio do remetente verificado).
 */
export const CONTRACTOR_MAIL_SETTINGS_STATUSES = ['pending', 'active', 'failed'] as const
export type ContractorMailSettingsStatus = (typeof CONTRACTOR_MAIL_SETTINGS_STATUSES)[number]

export const contractorMailSettings = pgTable(
  'contractor_mail_settings',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    secretEnvelope: jsonb('secret_envelope').notNull(),
    senderAddress: text('sender_address').notNull(),
    senderName: text('sender_name').notNull(),
    replyDomain: text('reply_domain').notNull(),
    webhookId: uuid('webhook_id').defaultRandom().notNull(),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    status: text().$type<ContractorMailSettingsStatus>().notNull().default('pending'),
    /** Gravado pela lista de verificação; zerado quando a chave ou o remetente mudam. */
    sendingVerifiedAt: timestamp('sending_verified_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_mail_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** Uma configuração por empresa. */
    unique('contractor_mail_settings_company_id_unique').on(table.companyId),
    /** Alvo da URL anônima do webhook: colisão apontaria o e-mail de uma empresa para outra. */
    unique('contractor_mail_settings_webhook_id_unique').on(table.webhookId),
    check(
      'contractor_mail_settings_status_check',
      sql`${table.status} in (${sql.raw(inList(CONTRACTOR_MAIL_SETTINGS_STATUSES))})`,
    ),
    check(
      'contractor_mail_settings_sender_address_check',
      sql`length(btrim(${table.senderAddress})) > 0`,
    ),
    check(
      'contractor_mail_settings_sender_name_check',
      sql`length(btrim(${table.senderName})) > 0`,
    ),
    check(
      'contractor_mail_settings_reply_domain_check',
      sql`length(btrim(${table.replyDomain})) > 0`,
    ),
    check('contractor_mail_settings_version_check', sql`${table.version} > 0`),
  ],
)

/**
 * RF1: a lista de contatos da contratante. A migration semeia esta tabela a partir de
 * `contractors.report_email` (T003), com `receives_occurrences = true` e `can_decide = false` — o
 * relatório de fechamento já ia para aquele endereço, e a decisão por e-mail é permissão nova, dada
 * à mão.
 *
 * ⚠️ Sem `citext` neste repositório (nenhuma tabela usa a extensão hoje): a igualdade por caixa é
 * garantida por um índice único sobre `lower(email)`, não pela coluna. Decisão registrada em
 * `evidence.md` da T003.
 */
export const CONTRACTOR_CONTACT_STATUSES = ['active', 'inactive'] as const
export type ContractorContactStatus = (typeof CONTRACTOR_CONTACT_STATUSES)[number]

/**
 * Spec 183 RF5: o que o contato recebe. `occurrences` e `approves_charges` são os dois campos antigos
 * (`receives_occurrences`, `can_decide`) — que seguem gravados, derivados destes na escrita (T302),
 * porque a 143 e a 150 os leem.
 */
export const CONTRACTOR_CONTACT_TYPES = [
  'occurrences',
  'approves_charges',
  'scheduling',
  'invoices',
  'cte_xml',
] as const
export type ContractorContactType = (typeof CONTRACTOR_CONTACT_TYPES)[number]

/** Spec 183 RF5: de quais grupos de ocorrência o contato quer saber. */
export const CONTRACTOR_CONTACT_OCCURRENCE_STAGES = ['separation', 'delivery', 'stop'] as const
export type ContractorContactOccurrenceStage = (typeof CONTRACTOR_CONTACT_OCCURRENCE_STAGES)[number]

export const CONTRACTOR_CONTACT_CHANNELS = ['email', 'whatsapp'] as const
export type ContractorContactChannel = (typeof CONTRACTOR_CONTACT_CHANNELS)[number]

const CONTACT_PHONE_PATTERN_LITERAL = sql.raw(`'${WHATSAPP_PHONE_PATTERN.source}'`)

export const contractorContacts = pgTable(
  'contractor_contacts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    email: text().notNull(),
    receivesOccurrences: boolean('receives_occurrences').notNull().default(true),
    canDecide: boolean('can_decide').notNull().default(false),
    /** Spec 183 RF5: quem é a pessoa. Vazio no contato anterior à 183, que era só um e-mail. */
    name: text().notNull().default(''),
    roleLabel: text('role_label').notNull().default(''),
    /**
     * Só dígitos com o DDI, no formato do WhatsApp verificado (`user_whatsapp_phones`): é contra ele
     * que o webhook compara o número que chegou.
     */
    phone: text(),
    types: text()
      .$type<ContractorContactType>()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    occurrenceStages: text('occurrence_stages')
      .$type<ContractorContactOccurrenceStage>()
      .array()
      .notNull()
      .default(sql`'{separation,delivery,stop}'::text[]`),
    /**
     * D6: o aceite do WhatsApp — quando e quem o registrou, do servidor. Sem ele, o número não recebe
     * mensagem da empresa e a mensagem dele não entra na conversa.
     */
    whatsappOptInAt: timestamp('whatsapp_opt_in_at', { withTimezone: true }),
    whatsappOptInByUserId: uuid('whatsapp_opt_in_by_user_id'),
    preferredChannel: text('preferred_channel')
      .$type<ContractorContactChannel>()
      .notNull()
      .default('email'),
    status: text().$type<ContractorContactStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_contacts_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** Par com `companyId`, como em `contractor_portal_bindings`: impede contato apontar para
     * contratante de outra empresa. */
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'contractor_contacts_contractor_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('contractor_contacts_contractor_idx').on(table.companyId, table.contractorId),
    /** `(company_id, contractor_id, email)` do plan.md, mas por caixa: `lower(email)`, não a coluna. */
    uniqueIndex('contractor_contacts_company_contractor_email_unique').on(
      table.companyId,
      table.contractorId,
      sql`lower(${table.email})`,
    ),
    check(
      'contractor_contacts_status_check',
      sql`${table.status} in (${sql.raw(inList(CONTRACTOR_CONTACT_STATUSES))})`,
    ),
    check('contractor_contacts_email_check', sql`length(btrim(${table.email})) > 0`),
    /**
     * Revisão final, item de segurança B1: `email` é `text()` sem teto — a fronteira HTTP já
     * recusa acima de 254 (RFC 5321 §4.5.3.1.3, `contractor-contacts.routes.ts`), esta CHECK é a
     * segunda trava, contra qualquer escrita que não passe pela rota.
     */
    check('contractor_contacts_email_length_check', sql`length(${table.email}) <= 254`),
    foreignKey({
      columns: [table.whatsappOptInByUserId],
      foreignColumns: [identityUsers.id],
      name: 'contractor_contacts_whatsapp_opt_in_by_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'contractor_contacts_types_check',
      sql`${table.types} <@ array[${sql.raw(inList(CONTRACTOR_CONTACT_TYPES))}]::text[]`,
    ),
    check(
      'contractor_contacts_occurrence_stages_check',
      sql`${table.occurrenceStages} <@ array[${sql.raw(inList(CONTRACTOR_CONTACT_OCCURRENCE_STAGES))}]::text[]`,
    ),
    check(
      'contractor_contacts_preferred_channel_check',
      sql`${table.preferredChannel} in (${sql.raw(inList(CONTRACTOR_CONTACT_CHANNELS))})`,
    ),
    check(
      'contractor_contacts_phone_check',
      sql`${table.phone} is null or ${table.phone} ~ ${CONTACT_PHONE_PATTERN_LITERAL}`,
    ),
    /** D6: o aceite sem autor, ou o autor sem data, não prova nada. */
    check(
      'contractor_contacts_whatsapp_opt_in_pair_check',
      sql`(${table.whatsappOptInAt} is null) = (${table.whatsappOptInByUserId} is null)`,
    ),
    check(
      'contractor_contacts_whatsapp_opt_in_phone_check',
      sql`${table.whatsappOptInAt} is null or ${table.phone} is not null`,
    ),
    check(
      'contractor_contacts_preferred_whatsapp_check',
      sql`${table.preferredChannel} <> 'whatsapp' or ${table.whatsappOptInAt} is not null`,
    ),
    /** O webhook resolve o remetente por telefone, dentro da empresa do canal. */
    index('contractor_contacts_company_phone_idx').on(table.companyId, table.phone),
  ],
)

/**
 * RF2/RF3: uma conversa por objeto (`subject_type` + `subject_id`), nunca por nota ou por taxa
 * soltas — hoje elas só se ligam pela nota, sem FK (comentário no `plan.md`), e por isso a conversa
 * aponta para um objeto só. `contractor_id` é nulo em `setup_test`: o e-mail de teste vai para o
 * próprio administrador, sem contratante nenhuma envolvida.
 *
 * `reply_token_hash` é o hash do token opaco de 128 bits do RF2. O plan.md pede `bytea`, mas este
 * repositório não tem nenhuma coluna binária — `password_reset_requests.code_hash` e
 * `user_invitations.code_hash` guardam hash como hex em `text`, com o mesmo CHECK. Decisão de
 * seguir esse padrão registrada em `evidence.md`.
 */
export const CONTRACTOR_MAIL_THREAD_SUBJECT_TYPES = [
  'stop_occurrence',
  'document_occurrence',
  'delivery_charge',
  'setup_test',
  'address_correction',
] as const
export type ContractorMailThreadSubjectType = (typeof CONTRACTOR_MAIL_THREAD_SUBJECT_TYPES)[number]

export const CONTRACTOR_MAIL_THREAD_STATUSES = ['open', 'closed'] as const
export type ContractorMailThreadStatus = (typeof CONTRACTOR_MAIL_THREAD_STATUSES)[number]

export const contractorMailThreads = pgTable(
  'contractor_mail_threads',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id'),
    subjectType: text('subject_type').$type<ContractorMailThreadSubjectType>().notNull(),
    subjectId: uuid('subject_id').notNull(),
    replyTokenHash: text('reply_token_hash').notNull(),
    status: text().$type<ContractorMailThreadStatus>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_mail_threads_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'contractor_mail_threads_contractor_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_mail_threads_company_id_id_unique').on(table.companyId, table.id),
    /** Uma conversa por objeto. */
    unique('contractor_mail_threads_company_subject_unique').on(
      table.companyId,
      table.subjectType,
      table.subjectId,
    ),
    /** Global, não por empresa: o webhook acha a conversa pelo hash do token antes de saber o tenant. */
    unique('contractor_mail_threads_reply_token_hash_unique').on(table.replyTokenHash),
    check(
      'contractor_mail_threads_subject_type_check',
      sql`${table.subjectType} in (${sql.raw(inList(CONTRACTOR_MAIL_THREAD_SUBJECT_TYPES))})`,
    ),
    check(
      'contractor_mail_threads_status_check',
      sql`${table.status} in (${sql.raw(inList(CONTRACTOR_MAIL_THREAD_STATUSES))})`,
    ),
    check(
      'contractor_mail_threads_contractor_setup_test_check',
      sql`(${table.subjectType} = 'setup_test') = (${table.contractorId} is null)`,
    ),
    check(
      'contractor_mail_threads_reply_token_hash_check',
      sql`${table.replyTokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
)

/**
 * Spec 150 RF13–RF15 (T402): modelos de e-mail por empresa e tipo. O modelo edita texto, nunca a
 * estrutura do e-mail. Ninguém cria linha aqui em migration ou seed (ADR-0021): o padrão sugerido
 * vive no catálogo e só vira linha quando o operador salva.
 */
export const contractorMailTemplates = pgTable(
  'contractor_mail_templates',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    mailType: text('mail_type').$type<ContractorMailTemplateType>().notNull(),
    name: text().notNull(),
    subject: text().notNull(),
    intro: text().notNull(),
    /** Repete-se uma vez por item enviado; único campo que aceita variável de item (RF14). */
    itemText: text('item_text').notNull().default(''),
    closing: text().notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    status: text().$type<ContractorMailTemplateStatus>().notNull().default('active'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_mail_templates_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** Alvo da FK composta de `contractor_mail_messages.template_id`. */
    unique('contractor_mail_templates_company_id_id_unique').on(table.companyId, table.id),
    uniqueIndex('contractor_mail_templates_company_type_name_unique')
      .on(table.companyId, table.mailType, sql`lower(${table.name})`)
      .where(sql`${table.status} = 'active'`),
    /** RF15: um padrão por tipo — a troca desmarca o anterior na mesma transação. */
    uniqueIndex('contractor_mail_templates_company_type_default_unique')
      .on(table.companyId, table.mailType)
      .where(sql`${table.isDefault} and ${table.status} = 'active'`),
    check(
      'contractor_mail_templates_mail_type_check',
      sql`${table.mailType} in (${sql.raw(inList(CONTRACTOR_MAIL_TEMPLATE_TYPES))})`,
    ),
    check(
      'contractor_mail_templates_status_check',
      sql`${table.status} in (${sql.raw(inList(CONTRACTOR_MAIL_TEMPLATE_STATUSES))})`,
    ),
    check(
      'contractor_mail_templates_name_check',
      sql`length(btrim(${table.name})) > 0 and length(${table.name}) <= ${sql.raw(String(CONTRACTOR_MAIL_TEMPLATE_LIMITS.name))}`,
    ),
    /** Assunto vira cabeçalho de e-mail: sem quebra de linha, que abriria injeção de cabeçalho. */
    check(
      'contractor_mail_templates_subject_check',
      sql`length(btrim(${table.subject})) > 0 and length(${table.subject}) <= ${sql.raw(String(CONTRACTOR_MAIL_TEMPLATE_LIMITS.subject))} and ${table.subject} !~ '[\\r\\n]'`,
    ),
    check(
      'contractor_mail_templates_intro_check',
      sql`length(btrim(${table.intro})) > 0 and length(${table.intro}) <= ${sql.raw(String(CONTRACTOR_MAIL_TEMPLATE_LIMITS.text))}`,
    ),
    check(
      'contractor_mail_templates_item_text_check',
      sql`length(${table.itemText}) <= ${sql.raw(String(CONTRACTOR_MAIL_TEMPLATE_LIMITS.text))}`,
    ),
    check(
      'contractor_mail_templates_closing_check',
      sql`length(btrim(${table.closing})) > 0 and length(${table.closing}) <= ${sql.raw(String(CONTRACTOR_MAIL_TEMPLATE_LIMITS.text))}`,
    ),
    check(
      'contractor_mail_templates_default_active_check',
      sql`not ${table.isDefault} or ${table.status} = 'active'`,
    ),
    check('contractor_mail_templates_version_check', sql`${table.version} > 0`),
  ],
)

/**
 * RF4/RF5/RF7: mensagem append-only. `actor_user_id` é nulo em toda `inbound` (RF5 — quem escreveu
 * foi a contratante, não um usuário nosso) e pode ser nulo também em `outbound` automática (P4, sem
 * clique de operador). `raw_object_id`/`raw_sha256` só existem em `inbound` (RF4: o MIME bruto de
 * todo e-mail **recebido** é baixado e gravado antes de qualquer interpretação); `delivery_status`
 * só existe em `outbound`.
 */
export const CONTRACTOR_MAIL_MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const
export type ContractorMailMessageDirection = (typeof CONTRACTOR_MAIL_MESSAGE_DIRECTIONS)[number]

export const CONTRACTOR_MAIL_DKIM_RESULTS = [
  'aligned',
  'not_aligned',
  'unverifiable',
  'absent',
] as const
export type ContractorMailDkimResult = (typeof CONTRACTOR_MAIL_DKIM_RESULTS)[number]

export const CONTRACTOR_MAIL_INTERPRETATIONS = [
  'approve',
  'reject',
  'message',
  'late',
  'ignored_auto_reply',
] as const
export type ContractorMailInterpretation = (typeof CONTRACTOR_MAIL_INTERPRETATIONS)[number]

export const CONTRACTOR_MAIL_DOWNGRADE_REASONS = [
  'keyword_absent',
  'sender_not_listed',
  'sender_cannot_decide',
  'dkim_not_aligned',
  'dkim_unverifiable',
  'charge_not_submitted',
] as const
export type ContractorMailDowngradeReason = (typeof CONTRACTOR_MAIL_DOWNGRADE_REASONS)[number]

export const CONTRACTOR_MAIL_DELIVERY_STATUSES = ['queued', 'sent', 'failed'] as const
export type ContractorMailDeliveryStatus = (typeof CONTRACTOR_MAIL_DELIVERY_STATUSES)[number]

export const contractorMailMessages = pgTable(
  'contractor_mail_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    threadId: uuid('thread_id').notNull(),
    direction: text().$type<ContractorMailMessageDirection>().notNull(),
    actorUserId: uuid('actor_user_id'),
    fromAddress: text('from_address').notNull(),
    /**
     * Correção pós-entrega da T009 (spec 143): o `subject_type` da conversa não basta mais para
     * derivar o assunto no worker — cada mensagem grava o dela, porque a fila deixou de carregar
     * qualquer coisa além de `messageId` (§6 do baseline de segurança: job carrega referência, não
     * dado). Vale para `inbound` também: a T010 grava ali o assunto que a contratante enviou.
     */
    subject: text().notNull(),
    /**
     * O destinatário também deixou de viajar na fila — mesma razão do `subject`. Array porque uma
     * mensagem pode ir para mais de um contato da contratante (RF1: vários com
     * `receives_occurrences`); `inbound` grava aqui os endereços aos quais a contratante respondeu
     * (o(s) endereço(s) `To` do e-mail recebido).
     */
    toAddresses: text('to_addresses').array().notNull(),
    bodyText: text('body_text').notNull(),
    /**
     * Spec 150 T302: o HTML do e-mail de saída, montado aqui e nunca no worker — o registro guarda o
     * que foi de fato enviado. `null` em mensagem antiga e em `setup_test`, que saem só em texto.
     */
    bodyHtml: text('body_html'),
    /** Spec 150 T402 (RF15): o modelo usado no envio. `null` em mensagem antiga, `inbound` e teste. */
    templateId: uuid('template_id'),
    rawObjectId: uuid('raw_object_id'),
    rawSha256: text('raw_sha256'),
    providerEmailId: text('provider_email_id'),
    rfcMessageId: text('rfc_message_id'),
    inReplyTo: text('in_reply_to'),
    dkimResult: text('dkim_result').$type<ContractorMailDkimResult>(),
    interpretation: text().$type<ContractorMailInterpretation>(),
    downgradeReason: text('downgrade_reason').$type<ContractorMailDowngradeReason>(),
    deliveryStatus: text('delivery_status').$type<ContractorMailDeliveryStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_mail_messages_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.threadId],
      foreignColumns: [contractorMailThreads.companyId, contractorMailThreads.id],
      name: 'contractor_mail_messages_thread_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.rawObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'contractor_mail_messages_raw_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.templateId],
      foreignColumns: [contractorMailTemplates.companyId, contractorMailTemplates.id],
      name: 'contractor_mail_messages_template_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_mail_messages_company_id_id_unique').on(table.companyId, table.id),
    /** RF11: o mesmo `email_id` do Resend converge numa mensagem só, mesmo com o Svix retentando. */
    unique('contractor_mail_messages_company_provider_email_unique').on(
      table.companyId,
      table.providerEmailId,
    ),
    index('contractor_mail_messages_thread_idx').on(
      table.companyId,
      table.threadId,
      table.createdAt,
    ),
    check(
      'contractor_mail_messages_direction_check',
      sql`${table.direction} in (${sql.raw(inList(CONTRACTOR_MAIL_MESSAGE_DIRECTIONS))})`,
    ),
    check(
      'contractor_mail_messages_inbound_actor_check',
      sql`${table.direction} <> 'inbound' or ${table.actorUserId} is null`,
    ),
    check(
      'contractor_mail_messages_raw_direction_check',
      sql`${table.direction} = 'inbound' or (${table.rawObjectId} is null and ${table.rawSha256} is null)`,
    ),
    check(
      'contractor_mail_messages_raw_pair_check',
      sql`(${table.rawObjectId} is null) = (${table.rawSha256} is null)`,
    ),
    check(
      'contractor_mail_messages_raw_sha256_check',
      sql`${table.rawSha256} is null or ${table.rawSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'contractor_mail_messages_dkim_result_check',
      sql`${table.dkimResult} is null or ${table.dkimResult} in (${sql.raw(inList(CONTRACTOR_MAIL_DKIM_RESULTS))})`,
    ),
    check(
      'contractor_mail_messages_interpretation_check',
      sql`${table.interpretation} is null or ${table.interpretation} in (${sql.raw(inList(CONTRACTOR_MAIL_INTERPRETATIONS))})`,
    ),
    check(
      'contractor_mail_messages_downgrade_reason_check',
      sql`${table.downgradeReason} is null or ${table.downgradeReason} in (${sql.raw(inList(CONTRACTOR_MAIL_DOWNGRADE_REASONS))})`,
    ),
    check(
      'contractor_mail_messages_delivery_status_check',
      sql`${table.deliveryStatus} is null or ${table.deliveryStatus} in (${sql.raw(inList(CONTRACTOR_MAIL_DELIVERY_STATUSES))})`,
    ),
    /** Só `outbound` tem status de entrega — `inbound` não é enviada por nós. */
    check(
      'contractor_mail_messages_delivery_status_direction_check',
      sql`(${table.direction} = 'outbound') = (${table.deliveryStatus} is not null)`,
    ),
    check('contractor_mail_messages_body_text_check', sql`length(${table.bodyText}) > 0`),
    check(
      'contractor_mail_messages_from_address_check',
      sql`length(btrim(${table.fromAddress})) > 0`,
    ),
    check('contractor_mail_messages_subject_check', sql`length(btrim(${table.subject})) > 0`),
    check(
      'contractor_mail_messages_to_addresses_check',
      sql`array_length(${table.toAddresses}, 1) > 0`,
    ),
    check(
      'contractor_mail_messages_body_html_direction_check',
      sql`${table.bodyHtml} is null or ${table.direction} = 'outbound'`,
    ),
    check(
      'contractor_mail_messages_body_html_size_check',
      sql`octet_length(${table.bodyHtml}) <= 524288`,
    ),
  ],
)

/**
 * Saída, no molde de `aggregate_attachment_outbox` (sem ator): a mensagem já existe
 * (`delivery_status = queued`) quando o evento é gravado, na mesma transação — por isso ele referencia
 * a mensagem por FK composta, como o molde referencia o anexo.
 */
export const CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES = ['message.send.requested'] as const
export type ContractorMailOutboxEventType = (typeof CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES)[number]

export const contractorMailOutbox = pgTable(
  'contractor_mail_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    messageId: uuid('message_id').notNull(),
    eventType: text('event_type').$type<ContractorMailOutboxEventType>().notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_mail_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.messageId],
      foreignColumns: [contractorMailMessages.companyId, contractorMailMessages.id],
      name: 'contractor_mail_outbox_company_message_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_mail_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('contractor_mail_outbox_company_id_event_id_unique').on(table.companyId, table.eventId),
    index('contractor_mail_outbox_company_published_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check(
      'contractor_mail_outbox_event_type_check',
      sql`${table.eventType} in (${sql.raw(inList(CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES))})`,
    ),
  ],
)

/**
 * Entrada, no mesmo molde. Diferente do de saída, não há linha local para referenciar por FK: o
 * webhook só conhece `provider_email_id` (plan.md, "Payload de entrada na fila") — quem busca o
 * resto no Resend, baixa o MIME e cria a mensagem é o worker, depois deste evento existir.
 */
export const CONTRACTOR_INBOUND_EMAIL_OUTBOX_EVENT_TYPES = ['email.received'] as const
export type ContractorInboundEmailOutboxEventType =
  (typeof CONTRACTOR_INBOUND_EMAIL_OUTBOX_EVENT_TYPES)[number]

export const contractorInboundEmailOutbox = pgTable(
  'contractor_inbound_email_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    providerEmailId: text('provider_email_id').notNull(),
    eventType: text('event_type').$type<ContractorInboundEmailOutboxEventType>().notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_inbound_email_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_inbound_email_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('contractor_inbound_email_outbox_company_id_event_id_unique').on(
      table.companyId,
      table.eventId,
    ),
    /**
     * T010 (RF11/plan.md § Idempotência): o Svix retenta qualquer resposta que não seja 2xx, e o
     * mesmo `email_id` pode chegar mais de uma vez mesmo depois de aceito. Este único converge o
     * evento — `ON CONFLICT DO NOTHING` na gravação — sem depender só da unicidade da mensagem
     * final, que só existe depois de o worker processar o evento.
     */
    unique('contractor_inbound_email_outbox_company_provider_email_unique').on(
      table.companyId,
      table.providerEmailId,
    ),
    index('contractor_inbound_email_outbox_company_published_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check(
      'contractor_inbound_email_outbox_event_type_check',
      sql`${table.eventType} in (${sql.raw(inList(CONTRACTOR_INBOUND_EMAIL_OUTBOX_EVENT_TYPES))})`,
    ),
    check(
      'contractor_inbound_email_outbox_provider_email_id_check',
      sql`length(btrim(${table.providerEmailId})) > 0`,
    ),
  ],
)
