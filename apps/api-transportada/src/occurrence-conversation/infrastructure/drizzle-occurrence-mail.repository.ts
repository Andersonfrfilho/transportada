/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T403: a transação do e-mail da conversa com a contratante. Toda leitura e escrita leva
 * `company_id`; a thread, a mensagem e o outbox são os da 143 (`contractor_mail_*`), e a conversa
 * só acrescenta a linha que aponta para a mensagem de lá.
 */
import { resolveCompanyDisplayName } from '../../companies/domain/company-display-name.policy.js'
import type { ConversationAttachmentTransactionPort } from '../application/conversation-attachment.port.js'
import { createConversationAttachmentTransactionPort } from './drizzle-conversation-attachment.repository.js'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES,
  companyFiscalProfiles,
  companyOccurrenceTypes,
  contractorContacts,
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailSettings,
  contractorMailThreads,
  identityUserProfiles,
  idempotencyRecords,
  membershipRoles,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocumentOccurrences,
  tripDocuments,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import {
  buildContractorMailValues,
  buildOccurrenceItemRows,
} from '../../trips/domain/occurrence-mail-values.policy.js'
import { resolveOccurrenceProductCodes } from '../../trips/domain/occurrence-scope.policy.js'
import { readOccurrenceMailValues } from '../../trips/infrastructure/delivery-proof-read.support.js'
import { listOccurrenceProductCodes } from '../../trips/infrastructure/drizzle-occurrence-product.repository.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import { readOccurrenceTypeRecipientContactIds } from '../../trips/infrastructure/occurrence-type-mail-recipients.support.js'
import { loadEffectiveWatcherCandidates } from '../../contractor-mail/infrastructure/occurrence-watcher-candidates.query.js'
import { HTML_BODY_REGEX } from '../domain/occurrence-contractor-mail.constant.js'
import { renderContractorMail } from '../domain/occurrence-contractor-mail-render.policy.js'
import { OccurrenceMailTemplateMissingError } from '../domain/occurrence-conversation.error.js'
import { composeOccurrenceMailHtml } from '../domain/occurrence-mail-html-compose.policy.js'
import {
  assessContractorTemplate,
  blocksContractorMailSend,
} from '../domain/occurrence-contractor-template.policy.js'
import { findActiveContractorTemplate } from './notification-template.query.js'
import { resolveSignerJobTitle } from '../domain/occurrence-mail-signer.policy.js'
import type {
  CarrierIdentity,
  OccurrenceMailContact,
  OccurrenceMailHtmlSource,
  OccurrenceMailIdempotencyRecord,
  OccurrenceMailRecipientCandidate,
  OccurrenceMailSettings,
  OccurrenceMailTarget,
  OccurrenceMailTransactionPort,
  OccurrenceMailUnitOfWorkPort,
  OccurrenceNotificationTemplate,
  OccurrenceOperatorSigner,
  OccurrenceSuggestedMailPort,
  RecordOccurrenceMailInput,
  SendOccurrenceMailResult,
} from '../application/occurrence-mail.port.js'
import {
  findContractorReplyConfiguration,
  openContractorReply,
} from './drizzle-occurrence-contractor-reply.repository.js'
import { recordContractorReplyResend } from './drizzle-contractor-reply-resend.repository.js'
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type { AutomaticOccurrenceMailReaderPort } from '../application/send-automatic-occurrence-mail.use-case.js'
import { initialOutboundStatus } from '../domain/message-status.policy.js'
import {
  OCCURRENCE_THREAD_SUBJECT_TYPE,
  SEND_OCCURRENCE_MAIL_OPERATION,
} from '../domain/occurrence-conversation.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const ACTIVE_CONTACT_STATUS = 'active'
const [MESSAGE_SEND_REQUESTED_EVENT_TYPE] = CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES

async function acquireAdvisoryLock(
  transaction: Transaction,
  fields: readonly string[],
): Promise<void> {
  const encoded = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

/** A contratante pelo emitente da nota (T203); ocorrência sem nota não tem a quem escrever. */
async function findOccurrenceTarget(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<OccurrenceMailTarget | null> {
  const item = await findTripOccurrenceFeedItem(queryable, params)
  if (item === null) return null
  /** Spec 237 (ADR-0094 §9.6): a ocorrência de recebimento ainda não tem conversa nem e-mail. */
  if (item.stage === TRIP_OCCURRENCE_STAGE.receiving) return null
  return {
    contractorId: item.document?.contractor?.contractorId ?? null,
    contractorName: item.document?.contractor?.name ?? '',
    contractorTaxId: item.document?.contractor?.taxId ?? null,
    kind: item.source,
    occurrenceTypeId: item.occurrenceTypeId ?? null,
    stage: item.stage ?? 'stop',
  }
}

const FORWARD_TARGETS_SQL = sql`('note_recipient_email', 'informed_email')`

/**
 * Spec 274 (D6): o assunto do último e-mail de saída da ocorrência, sem o encaminhamento da 248 (mesma exclusão da
 * cadeia de referências do worker), mais o tipo e o número da nota para o assunto de abertura.
 */
async function findChatMailSubjectFacts(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  },
): Promise<{
  readonly invoiceNumber: null | string
  readonly lastOutboundSubject: null | string
  readonly typeName: string
}> {
  const item = await findTripOccurrenceFeedItem(queryable, {
    companyId: params.companyId,
    occurrenceId: params.occurrenceId,
  })
  const rows = (await queryable.execute(
    sql`select m.subject from contractor_mail_messages m
        join contractor_mail_threads t on t.company_id = m.company_id and t.id = m.thread_id
        where m.company_id = ${params.companyId}::uuid
          and m.direction = 'outbound'
          and t.subject_type = ${OCCURRENCE_THREAD_SUBJECT_TYPE[params.occurrenceKind]}
          and t.subject_id = ${params.occurrenceId}::uuid
          and not exists (
            select 1 from occurrence_contractor_reply_deliveries d
            where d.company_id = m.company_id
              and d.mail_message_id = m.id
              and d.target in ${FORWARD_TARGETS_SQL}
          )
        order by m.created_at desc, m.id desc
        limit 1`,
  )) as readonly Record<string, unknown>[]
  const subject = rows[0]?.subject
  return {
    invoiceNumber: item?.invoiceNumber ?? null,
    lastOutboundSubject: typeof subject === 'string' && subject.trim() !== '' ? subject : null,
    typeName: item?.typeName ?? '',
  }
}

async function listOccurrenceRecipients(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly contractorId: string },
): Promise<readonly OccurrenceMailRecipientCandidate[]> {
  return queryable
    .select({
      email: contractorContacts.email,
      id: contractorContacts.id,
      name: contractorContacts.name,
      occurrenceStages: contractorContacts.occurrenceStages,
      roleLabel: contractorContacts.roleLabel,
      types: contractorContacts.types,
    })
    .from(contractorContacts)
    .where(
      and(
        eq(contractorContacts.companyId, params.companyId),
        eq(contractorContacts.contractorId, params.contractorId),
        eq(contractorContacts.status, ACTIVE_CONTACT_STATUS),
        eq(contractorContacts.receivesOccurrences, true),
      ),
    )
    .orderBy(asc(contractorContacts.createdAt), asc(contractorContacts.email))
}

async function findChosenOccurrenceRecipientIds(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<readonly string[]> {
  return readOccurrenceTypeRecipientContactIds(queryable, params)
}

async function findCarrierIdentity(
  queryable: TripQueryable,
  params: { readonly companyId: string },
): Promise<CarrierIdentity | undefined> {
  const [row] = await queryable
    .select({
      city: companyFiscalProfiles.city,
      cnpj: companyFiscalProfiles.cnpj,
      displayNameMode: companyFiscalProfiles.displayNameMode,
      /** Colunas escritas por extenso: o Drizzle as imprime sem o prefixo da tabela, e `company_id` ligaria ao próprio logo. */
      hasLogo: sql<boolean>`exists (select 1 from company_logos where company_logos.company_id = company_fiscal_profiles.company_id)`,
      legalName: companyFiscalProfiles.legalName,
      state: companyFiscalProfiles.state,
      tradeName: companyFiscalProfiles.tradeName,
    })
    .from(companyFiscalProfiles)
    .where(eq(companyFiscalProfiles.companyId, params.companyId))
    .limit(1)
  if (row === undefined) return undefined
  return {
    city: row.city,
    cnpj: row.cnpj,
    displayName: resolveCompanyDisplayName(row),
    hasLogo: row.hasLogo,
    legalName: row.legalName,
    state: row.state,
  }
}

/**
 * Spec 272 (ADR-0110 §6/§11): o assinante do envio manual numa consulta só — o perfil, o cargo livre da membership
 * ativa e os papéis **diretos** (`membership_roles`). Uma falha derruba a leitura inteira: sem `Promise.all`.
 */
async function findOperatorSigner(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly userId: string },
): Promise<OccurrenceOperatorSigner | undefined> {
  const rows = await queryable
    .select({
      jobTitle: userCompanyMemberships.jobTitle,
      name: identityUserProfiles.name,
      role: membershipRoles.role,
    })
    .from(identityUserProfiles)
    .innerJoin(
      userCompanyMemberships,
      eq(userCompanyMemberships.userId, identityUserProfiles.userId),
    )
    .leftJoin(membershipRoles, eq(membershipRoles.membershipId, userCompanyMemberships.id))
    .where(
      and(
        eq(identityUserProfiles.userId, params.userId),
        eq(userCompanyMemberships.companyId, params.companyId),
        eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
  const [first] = rows
  if (first === undefined) return undefined
  const jobTitle = resolveSignerJobTitle({
    directRoles: rows.flatMap((row) => (row.role === null ? [] : [row.role])),
    jobTitle: first.jobTitle,
  })
  return { ...(jobTitle === undefined ? {} : { jobTitle }), name: first.name }
}

/**
 * Spec 271 (ADR-0108, D1/D9): o modelo do tipo da ocorrência — a chave escolhida no tipo e a versão ativa mais alta
 * no módulo de notificação. Sem chave, sem versão ativa de e-mail `pt-BR`, de corpo HTML ou sem assunto: `null`,
 * ≡ sem modelo. Duas consultas, sem trava: o envio reconfere, e quem desativa o modelo no módulo não espera por nós.
 */
async function findOccurrenceNotificationTemplateSource(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<{
  readonly isRegisteredBeforeSelection: boolean
  readonly key: string
  readonly version: number
} | null> {
  const [row] = await queryable
    .select({
      key: companyOccurrenceTypes.contractorNotificationTemplateKey,
      occurrenceCreatedAt: tripDocumentOccurrences.createdAt,
      selectedAt: companyOccurrenceTypes.contractorNotificationTemplateSelectedAt,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, params.companyId),
        eq(tripDocumentOccurrences.id, params.occurrenceId),
      ),
    )
    .limit(1)
  if (row?.key === null || row === undefined) return null
  const template = await findActiveContractorTemplate(queryable, {
    companyId: params.companyId,
    key: row.key,
  })
  if (blocksContractorMailSend(assessContractorTemplate({ key: row.key, template }))) return null
  return {
    isRegisteredBeforeSelection:
      row.selectedAt !== null && row.occurrenceCreatedAt.getTime() < row.selectedAt.getTime(),
    key: row.key,
    version: template?.version ?? 0,
  }
}

async function findOccurrenceNotificationTemplate(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<null | OccurrenceNotificationTemplate> {
  const source = await findOccurrenceNotificationTemplateSource(queryable, params)
  return source === null ? null : { key: source.key, version: source.version }
}

/** O modelo (chave e versão) da primeira mensagem de e-mail desta ocorrência (reenvio do retorno, spec 248). */
async function findOriginalOccurrenceNotificationTemplate(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  },
): Promise<null | OccurrenceNotificationTemplate> {
  const [row] = await queryable
    .select({
      key: contractorMailMessages.notificationTemplateKey,
      version: contractorMailMessages.notificationTemplateVersion,
    })
    .from(contractorMailMessages)
    .innerJoin(
      contractorMailThreads,
      and(
        eq(contractorMailThreads.companyId, contractorMailMessages.companyId),
        eq(contractorMailThreads.id, contractorMailMessages.threadId),
      ),
    )
    .where(
      and(
        eq(contractorMailMessages.companyId, params.companyId),
        eq(contractorMailMessages.direction, 'outbound'),
        eq(
          contractorMailThreads.subjectType,
          OCCURRENCE_THREAD_SUBJECT_TYPE[params.occurrenceKind],
        ),
        eq(contractorMailThreads.subjectId, params.occurrenceId),
      ),
    )
    .orderBy(asc(contractorMailMessages.createdAt))
    .limit(1)
  return row?.key == null || row.version === null ? null : { key: row.key, version: row.version }
}

/** Spec 272: a prévia lê a configuração para decidir a faixa de resposta como o envio decide. */
async function findMailSettings(
  database: TripQueryable,
  params: { readonly companyId: string },
): Promise<OccurrenceMailSettings | undefined> {
  const [row] = await database
    .select({
      id: contractorMailSettings.id,
      secretEnvelope: contractorMailSettings.secretEnvelope,
      senderAddress: contractorMailSettings.senderAddress,
      sendingVerifiedAt: contractorMailSettings.sendingVerifiedAt,
    })
    .from(contractorMailSettings)
    .where(eq(contractorMailSettings.companyId, params.companyId))
    .limit(1)
  return row
}

/** A prévia só lê: as leituras que ela precisa, sem transação. */
export function createOccurrenceMailReader(
  database: TripQueryable,
): Pick<
  OccurrenceMailTransactionPort,
  | 'findCarrierIdentity'
  | 'findChosenOccurrenceRecipientIds'
  | 'findMailSettings'
  | 'findOccurrenceMailHtmlSource'
  | 'findOccurrenceNotificationTemplate'
  | 'findOccurrenceTarget'
  | 'findOperatorSigner'
  | 'listOccurrenceRecipients'
  | 'loadWatcherCandidates'
> {
  return {
    findCarrierIdentity: (params) => findCarrierIdentity(database, params),
    findChosenOccurrenceRecipientIds: (params) =>
      findChosenOccurrenceRecipientIds(database, params),
    findMailSettings: (params) => findMailSettings(database, params),
    findOccurrenceMailHtmlSource: (params) => findOccurrenceMailHtmlSource(database, params),
    findOccurrenceNotificationTemplate: (params) =>
      findOccurrenceNotificationTemplate(database, params),
    findOccurrenceTarget: (params) => findOccurrenceTarget(database, params),
    findOperatorSigner: (params) => findOperatorSigner(database, params),
    listOccurrenceRecipients: (params) => listOccurrenceRecipients(database, params),
    loadWatcherCandidates: (params) => loadEffectiveWatcherCandidates(database, params),
  }
}

/**
 * O modelo da chave (spec 271) e os valores da nota — os mesmos que o registro lia do texto do tipo (079), com as
 * chaves `{{camelCase}}` da lista fechada. Modelo que não existe mais, ou ocorrência que sumiu: `null`.
 */
async function readTemplateSource(
  database: TripQueryable,
  params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly templateKey: string
  },
): Promise<null | {
  readonly itemLines: readonly string[]
  readonly itemRows: OccurrenceMailHtmlSource['itemRows']
  readonly itemsSum: string
  readonly mail: Readonly<Record<string, string>>
  readonly template: { readonly body: string; readonly subject: string }
}> {
  const template = await findActiveContractorTemplate(database, {
    companyId: params.companyId,
    key: params.templateKey,
  })
  if (template === null) return null
  // O modelo é relido aqui, depois da avaliação que o aceitou: uma versão nova pode ter chegado no intervalo.
  if (blocksContractorMailSend(assessContractorTemplate({ key: params.templateKey, template }))) {
    return null
  }

  const [row] = await database
    .select({
      createdAt: tripDocumentOccurrences.createdAt,
      note: tripDocumentOccurrences.note,
      productCode: tripDocumentOccurrences.productCode,
      tripDocumentId: tripDocuments.id,
      tripId: tripDocuments.tripId,
      typeName: companyOccurrenceTypes.name,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, params.companyId),
        eq(tripDocumentOccurrences.id, params.occurrenceId),
      ),
    )
    .limit(1)
  if (row === undefined) return null

  const storedCodes = await listOccurrenceProductCodes(database, {
    companyId: params.companyId,
    occurrenceIds: [params.occurrenceId],
  })
  const values = await readOccurrenceMailValues(database, {
    companyId: params.companyId,
    documentId: row.tripDocumentId,
    note: row.note,
    occurrenceId: params.occurrenceId,
    occurrenceTypeName: row.typeName,
    occurredOn: row.createdAt.toLocaleDateString('pt-BR'),
    productCodes: resolveOccurrenceProductCodes({
      productCode: row.productCode,
      productCodes: storedCodes.get(params.occurrenceId) ?? [],
    }),
    tripId: row.tripId,
  })
  const { itemLines, mail } = buildContractorMailValues(values)
  const { itemsSum, rows } = buildOccurrenceItemRows(values)
  return { itemLines, itemRows: rows, itemsSum, mail, template }
}

/**
 * Spec 272 (ADR-0110 §1): o modelo e os valores da nota para o caminho HTML; `null` quando o modelo não existe ou o
 * corpo é texto — quem chama segue o caminho de texto de hoje.
 */
async function findOccurrenceMailHtmlSource(
  database: TripQueryable,
  params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly templateKey: string
  },
): Promise<null | OccurrenceMailHtmlSource> {
  const source = await readTemplateSource(database, params)
  if (source === null || !HTML_BODY_REGEX.test(source.template.body)) return null
  return {
    bodyTemplate: source.template.body,
    itemLines: source.itemLines,
    itemRows: source.itemRows,
    itemsSum: source.itemsSum,
    subjectTemplate: source.template.subject,
    values: source.mail,
  }
}

/**
 * O texto do modelo do tipo (spec 271) com os valores da nota. Modelo HTML (spec 272): o texto é o da **área de
 * mensagem**, com a equipe como assinante — o aviso automático é quem lê aqui, e o texto só entra na conversa; o
 * e-mail em si é composto no envio.
 */
export function createOccurrenceSuggestedMailReader(
  database: TripQueryable,
): OccurrenceSuggestedMailPort {
  return {
    async readSuggestedMail(params) {
      const source = await readTemplateSource(database, params)
      if (source === null) return null
      if (!HTML_BODY_REGEX.test(source.template.body)) {
        return renderContractorMail({
          bodyTemplate: source.template.body,
          itemLines: source.itemLines,
          subjectTemplate: source.template.subject,
          values: source.mail,
        })
      }
      const target = await findOccurrenceTarget(database, params)
      try {
        const composed = composeOccurrenceMailHtml({
          appBaseUrl: undefined,
          carrier: await findCarrierIdentity(database, params),
          contractorTaxId: target?.contractorTaxId ?? null,
          hasReplyTo: false,
          signer: { kind: 'team' },
          source: {
            bodyTemplate: source.template.body,
            itemLines: source.itemLines,
            itemRows: source.itemRows,
            itemsSum: source.itemsSum,
            subjectTemplate: source.template.subject,
            values: source.mail,
          },
        })
        return { bodyText: composed.areaText, subject: composed.subject }
      } catch (error) {
        /** Modelo sem área ou grande demais: é o mesmo que sem modelo utilizável. */
        if (error instanceof OccurrenceMailTemplateMissingError) return null
        throw error
      }
    },
  }
}

/**
 * Spec 183 T802: o que o aviso automático precisa saber da ocorrência, em leituras sem transação —
 * o envio em si abre a dele. A contratante e a etapa vêm da mesma leitura da listagem; o interruptor,
 * do tipo; o texto, do mesmo leitor da prévia (079); os contatos, dos que recebem ocorrência.
 */
export function createAutomaticOccurrenceMailReader(
  database: TripQueryable,
): AutomaticOccurrenceMailReaderPort {
  const suggested = createOccurrenceSuggestedMailReader(database)

  async function readPlannedSuggestion(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly emailsContractor: boolean
    readonly occurrenceId: string
  }): Promise<{
    readonly isRegisteredBeforeTemplate: boolean
    readonly suggested: Awaited<ReturnType<OccurrenceSuggestedMailPort['readSuggestedMail']>>
  }> {
    if (!params.emailsContractor) return { isRegisteredBeforeTemplate: false, suggested: null }
    const source = await findOccurrenceNotificationTemplateSource(database, params)
    if (source === null) return { isRegisteredBeforeTemplate: false, suggested: null }
    return {
      isRegisteredBeforeTemplate: source.isRegisteredBeforeSelection,
      suggested: await suggested.readSuggestedMail({
        companyId: params.companyId,
        occurrenceId: params.occurrenceId,
        templateKey: source.key,
      }),
    }
  }

  return {
    async findPlan(params) {
      const target = await findOccurrenceTarget(database, params)
      if (
        target === null ||
        target.kind !== 'document' ||
        target.contractorId === null ||
        target.stage === 'stop'
      ) {
        return null
      }
      const [type] = await database
        .select({
          emailsContractor: companyOccurrenceTypes.emailsContractor,
          occurrenceTypeId: companyOccurrenceTypes.id,
        })
        .from(tripDocumentOccurrences)
        .innerJoin(
          companyOccurrenceTypes,
          and(
            eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
            eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
          ),
        )
        .where(
          and(
            eq(tripDocumentOccurrences.companyId, params.companyId),
            eq(tripDocumentOccurrences.id, params.occurrenceId),
          ),
        )
        .limit(1)
      if (type === undefined) return null
      const emailsContractor = type.emailsContractor
      const contacts = emailsContractor
        ? await database
            .select({
              email: contractorContacts.email,
              id: contractorContacts.id,
              occurrenceStages: contractorContacts.occurrenceStages,
              preferredChannel: contractorContacts.preferredChannel,
            })
            .from(contractorContacts)
            .where(
              and(
                eq(contractorContacts.companyId, params.companyId),
                eq(contractorContacts.contractorId, target.contractorId),
                eq(contractorContacts.status, ACTIVE_CONTACT_STATUS),
                eq(contractorContacts.receivesOccurrences, true),
              ),
            )
            .orderBy(asc(contractorContacts.createdAt), asc(contractorContacts.id))
        : []
      const planned = await readPlannedSuggestion({
        ...params,
        contractorId: target.contractorId,
        emailsContractor,
      })
      const chosenContactIds = emailsContractor
        ? await readOccurrenceTypeRecipientContactIds(database, {
            companyId: params.companyId,
            occurrenceTypeId: type.occurrenceTypeId,
          })
        : []
      return {
        chosenContactIds,
        emailsContractor,
        isRegisteredBeforeTemplate: planned.isRegisteredBeforeTemplate,
        recipients: contacts.map((contact) => ({
          contactId: contact.id,
          email: contact.email.trim() === '' ? null : contact.email,
          preferredChannel: contact.preferredChannel === 'whatsapp' ? 'whatsapp' : 'email',
          stages: contact.occurrenceStages,
        })),
        stage: target.stage,
        suggested: planned.suggested,
      }
    },
  }
}

export class DrizzleOccurrenceMailRepository implements OccurrenceMailUnitOfWorkPort {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: OccurrenceMailTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(new OccurrenceMailDrizzleTransaction(transaction)),
    )
  }
}

class OccurrenceMailDrizzleTransaction implements OccurrenceMailTransactionPort {
  public readonly attachments: ConversationAttachmentTransactionPort

  public constructor(private readonly transaction: Transaction) {
    this.attachments = createConversationAttachmentTransactionPort(transaction)
  }

  public loadWatcherCandidates(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly occurrenceTypeId?: null | string
  }) {
    return loadEffectiveWatcherCandidates(this.transaction, params)
  }

  public listOccurrenceRecipients(params: {
    readonly companyId: string
    readonly contractorId: string
  }): Promise<readonly OccurrenceMailRecipientCandidate[]> {
    return listOccurrenceRecipients(this.transaction, params)
  }

  public findContractorReplyConfiguration(
    params: Parameters<typeof findContractorReplyConfiguration>[1],
  ): ReturnType<typeof findContractorReplyConfiguration> {
    return findContractorReplyConfiguration(this.transaction, params)
  }

  public openContractorReply(params: Parameters<typeof openContractorReply>[1]): Promise<void> {
    return openContractorReply(this.transaction, params)
  }

  public recordContractorReplyResend(
    params: Parameters<typeof recordContractorReplyResend>[1],
  ): ReturnType<typeof recordContractorReplyResend> {
    return recordContractorReplyResend(this.transaction, params)
  }

  public findOccurrenceTarget(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<OccurrenceMailTarget | null> {
    return findOccurrenceTarget(this.transaction, params)
  }

  public findOccurrenceNotificationTemplate(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | OccurrenceNotificationTemplate> {
    return findOccurrenceNotificationTemplate(this.transaction, params)
  }

  public findChatMailSubjectFacts(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  }) {
    return findChatMailSubjectFacts(this.transaction, params)
  }

  public findOriginalOccurrenceNotificationTemplate(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  }): Promise<null | OccurrenceNotificationTemplate> {
    return findOriginalOccurrenceNotificationTemplate(this.transaction, params)
  }

  public findChosenOccurrenceRecipientIds(params: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<readonly string[]> {
    return findChosenOccurrenceRecipientIds(this.transaction, params)
  }

  public findCarrierIdentity(params: {
    readonly companyId: string
  }): Promise<CarrierIdentity | undefined> {
    return findCarrierIdentity(this.transaction, params)
  }

  public findOccurrenceMailHtmlSource(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly templateKey: string
  }): Promise<null | OccurrenceMailHtmlSource> {
    return findOccurrenceMailHtmlSource(this.transaction, params)
  }

  public findOperatorSigner(params: {
    readonly companyId: string
    readonly userId: string
  }): Promise<OccurrenceOperatorSigner | undefined> {
    return findOperatorSigner(this.transaction, params)
  }

  public async findIdempotency(params: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation?: string
  }): Promise<OccurrenceMailIdempotencyRecord | null> {
    const operation = params.operation ?? SEND_OCCURRENCE_MAIL_OPERATION
    await acquireAdvisoryLock(this.transaction, [
      operation,
      params.companyId,
      params.idempotencyKey,
    ])
    const [row] = await this.transaction
      .select({
        fingerprint: idempotencyRecords.requestFingerprint,
        response: idempotencyRecords.response,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.companyId, params.companyId),
          eq(idempotencyRecords.operation, operation),
          eq(idempotencyRecords.idempotencyKey, params.idempotencyKey),
        ),
      )
      .limit(1)
    if (row === undefined) return null
    return { fingerprint: row.fingerprint, response: row.response as SendOccurrenceMailResult }
  }

  public async saveIdempotency(params: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation?: string
    readonly response: SendOccurrenceMailResult
  }): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: params.companyId,
      idempotencyKey: params.idempotencyKey,
      operation: params.operation ?? SEND_OCCURRENCE_MAIL_OPERATION,
      requestFingerprint: params.fingerprint,
      response: params.response,
      status: 'succeeded',
    })
  }

  public findMailSettings(params: {
    readonly companyId: string
  }): Promise<OccurrenceMailSettings | undefined> {
    return findMailSettings(this.transaction, params)
  }

  public async findOccurrenceContacts(params: {
    readonly companyId: string
    readonly contactIds: readonly string[]
    readonly contractorId: string
  }): Promise<readonly OccurrenceMailContact[]> {
    if (params.contactIds.length === 0) return []
    return this.transaction
      .select({ email: contractorContacts.email, id: contractorContacts.id })
      .from(contractorContacts)
      .where(
        and(
          eq(contractorContacts.companyId, params.companyId),
          eq(contractorContacts.contractorId, params.contractorId),
          inArray(contractorContacts.id, [...params.contactIds]),
          eq(contractorContacts.status, ACTIVE_CONTACT_STATUS),
          eq(contractorContacts.receivesOccurrences, true),
        ),
      )
  }

  public async findOrCreateContractorConversation(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceMailTarget['kind']
    readonly publicRef: string
  }): Promise<{ readonly id: string }> {
    await this.transaction
      .insert(occurrenceConversations)
      .values({
        companyId: params.companyId,
        contractorId: params.contractorId,
        occurrenceId: params.occurrenceId,
        occurrenceKind: params.occurrenceKind,
        participant: 'contractor',
        publicRef: params.publicRef,
      })
      .onConflictDoNothing({
        target: [
          occurrenceConversations.companyId,
          occurrenceConversations.occurrenceKind,
          occurrenceConversations.occurrenceId,
          occurrenceConversations.participant,
        ],
      })
    const [row] = await this.transaction
      .select({ id: occurrenceConversations.id })
      .from(occurrenceConversations)
      .where(
        and(
          eq(occurrenceConversations.companyId, params.companyId),
          eq(occurrenceConversations.occurrenceKind, params.occurrenceKind),
          eq(occurrenceConversations.occurrenceId, params.occurrenceId),
          eq(occurrenceConversations.participant, 'contractor'),
        ),
      )
      .limit(1)
    if (row === undefined) throw new Error('OCCURRENCE_CONVERSATION_NOT_PERSISTED')
    return row
  }

  public async lockOccurrenceThread(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: string
  }): Promise<void> {
    await acquireAdvisoryLock(this.transaction, [
      'occurrence-mail-thread',
      params.companyId,
      params.occurrenceKind,
      params.occurrenceId,
    ])
  }

  public async findOccurrenceThread(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceMailTarget['kind']
  }): Promise<{ readonly id: string } | undefined> {
    const [row] = await this.transaction
      .select({ id: contractorMailThreads.id })
      .from(contractorMailThreads)
      .where(
        and(
          eq(contractorMailThreads.companyId, params.companyId),
          eq(
            contractorMailThreads.subjectType,
            OCCURRENCE_THREAD_SUBJECT_TYPE[params.occurrenceKind],
          ),
          eq(contractorMailThreads.subjectId, params.occurrenceId),
        ),
      )
      .limit(1)
    return row
  }

  public async recordMail(
    params: RecordOccurrenceMailInput,
  ): Promise<{ readonly messageId: string }> {
    if (params.createThread) {
      await this.transaction.insert(contractorMailThreads).values({
        companyId: params.companyId,
        contractorId: params.contractorId,
        id: params.threadId,
        replyTokenHash: params.replyTokenHash,
        subjectId: params.occurrenceId,
        subjectType: OCCURRENCE_THREAD_SUBJECT_TYPE[params.occurrenceKind],
      })
    }
    const [message] = await this.transaction
      .insert(contractorMailMessages)
      .values({
        actorUserId: params.actorUserId,
        bodyHtml: params.bodyHtml,
        bodyText: params.bodyText,
        companyId: params.companyId,
        deliveryStatus: 'queued',
        direction: 'outbound',
        fromAddress: params.fromAddress,
        fromDisplayName: params.fromDisplayName,
        hasInlineLogo: params.hasInlineLogo,
        notificationTemplateKey: params.notificationTemplate?.key ?? null,
        notificationTemplateVersion: params.notificationTemplate?.version ?? null,
        subject: params.subject,
        threadId: params.threadId,
        toAddresses: [...params.toAddresses],
        ccAddresses: [...params.ccAddresses],
        transport: params.transport,
      })
      .returning({ id: contractorMailMessages.id })
    if (message === undefined) throw new Error('OCCURRENCE_MAIL_MESSAGE_NOT_PERSISTED')

    await this.transaction.insert(contractorMailOutbox).values({
      companyId: params.companyId,
      correlationId: params.correlationId,
      eventType: MESSAGE_SEND_REQUESTED_EVENT_TYPE,
      messageId: message.id,
      payload: {},
    })
    return { messageId: message.id }
  }

  public async recordConversationMessage(params: {
    readonly authorUserId: null | string
    readonly automatic?: boolean
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly mailMessageId: string
    readonly queuedAt: string
  }): Promise<{ readonly id: string }> {
    const status = initialOutboundStatus('email')
    const [row] = await this.transaction
      .insert(occurrenceConversationMessages)
      .values({
        authorUserId: params.authorUserId,
        automatic: params.automatic === true,
        bodyText: params.bodyText,
        channel: 'email',
        companyId: params.companyId,
        conversationId: params.conversationId,
        direction: 'outbound',
        mailMessageId: params.mailMessageId,
        status,
        statusTimes: { [status]: params.queuedAt },
      })
      .returning({ id: occurrenceConversationMessages.id })
    if (row === undefined) throw new Error('OCCURRENCE_CONVERSATION_MESSAGE_NOT_PERSISTED')
    return row
  }
}
