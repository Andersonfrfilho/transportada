/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T403: a transação do e-mail da conversa com a contratante. Toda leitura e escrita leva
 * `company_id`; a thread, a mensagem e o outbox são os da 143 (`contractor_mail_*`), e a conversa
 * só acrescenta a linha que aponta para a mensagem de lá.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

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
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocumentOccurrences,
  tripDocuments,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { renderOccurrenceTemplate } from '../../trips/domain/occurrence-template.policy.js'
import { resolveOccurrenceProductCodes } from '../../trips/domain/occurrence-scope.policy.js'
import { readOccurrenceTemplateValues } from '../../trips/infrastructure/delivery-proof-read.support.js'
import { listOccurrenceProductCodes } from '../../trips/infrastructure/drizzle-occurrence-product.repository.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  OccurrenceMailContact,
  OccurrenceMailIdempotencyRecord,
  OccurrenceMailSettings,
  OccurrenceMailTarget,
  OccurrenceMailTransactionPort,
  OccurrenceMailUnitOfWorkPort,
  OccurrenceSuggestedMailPort,
  RecordOccurrenceMailInput,
  SendOccurrenceMailResult,
} from '../application/occurrence-mail.port.js'
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
  return {
    contractorId: item.document?.contractor?.contractorId ?? null,
    contractorName: item.document?.contractor?.name ?? '',
    kind: item.source,
  }
}

async function findCarrierName(
  queryable: TripQueryable,
  params: { readonly companyId: string },
): Promise<string | undefined> {
  const [row] = await queryable
    .select({
      legalName: companyFiscalProfiles.legalName,
      tradeName: companyFiscalProfiles.tradeName,
    })
    .from(companyFiscalProfiles)
    .where(eq(companyFiscalProfiles.companyId, params.companyId))
    .limit(1)
  if (row === undefined) return undefined
  return row.tradeName.trim().length > 0 ? row.tradeName : row.legalName
}

async function findOperatorName(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly userId: string },
): Promise<string | undefined> {
  const [row] = await queryable
    .select({ name: identityUserProfiles.name })
    .from(identityUserProfiles)
    .innerJoin(
      userCompanyMemberships,
      eq(userCompanyMemberships.userId, identityUserProfiles.userId),
    )
    .where(
      and(
        eq(identityUserProfiles.userId, params.userId),
        eq(userCompanyMemberships.companyId, params.companyId),
        eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .limit(1)
  return row?.name
}

/** A prévia só lê: as três leituras que ela precisa, sem transação. */
export function createOccurrenceMailReader(
  database: TripQueryable,
): Pick<
  OccurrenceMailTransactionPort,
  'findCarrierName' | 'findOccurrenceTarget' | 'findOperatorName'
> {
  return {
    findCarrierName: (params) => findCarrierName(database, params),
    findOccurrenceTarget: (params) => findOccurrenceTarget(database, params),
    findOperatorName: (params) => findOperatorName(database, params),
  }
}

/**
 * O texto que o tipo da ocorrência oferece (spec 079), com os valores da nota — o mesmo que o
 * registro devolve. Ocorrência de parada e tipo sem e-mail não têm modelo: `null`.
 */
export function createOccurrenceSuggestedMailReader(
  database: TripQueryable,
): OccurrenceSuggestedMailPort {
  return {
    async readSuggestedMail(params) {
      const [row] = await database
        .select({
          createdAt: tripDocumentOccurrences.createdAt,
          emailBody: companyOccurrenceTypes.emailBody,
          emailSubject: companyOccurrenceTypes.emailSubject,
          note: tripDocumentOccurrences.note,
          productCode: tripDocumentOccurrences.productCode,
          tripDocumentId: tripDocumentOccurrences.tripDocumentId,
          tripId: tripDocuments.tripId,
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
      if (row === undefined || row.emailSubject.trim() === '') return null

      const storedCodes = await listOccurrenceProductCodes(database, {
        companyId: params.companyId,
        occurrenceIds: [params.occurrenceId],
      })
      const values = await readOccurrenceTemplateValues(database, {
        companyId: params.companyId,
        documentId: row.tripDocumentId,
        note: row.note,
        occurredOn: row.createdAt.toLocaleDateString('pt-BR'),
        productCodes: resolveOccurrenceProductCodes({
          productCode: row.productCode,
          productCodes: storedCodes.get(params.occurrenceId) ?? [],
        }),
        tripId: row.tripId,
      })
      return {
        bodyText: renderOccurrenceTemplate({ template: row.emailBody, values }),
        subject: renderOccurrenceTemplate({ template: row.emailSubject, values }),
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
  public constructor(private readonly transaction: Transaction) {}

  public findOccurrenceTarget(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<OccurrenceMailTarget | null> {
    return findOccurrenceTarget(this.transaction, params)
  }

  public findCarrierName(params: { readonly companyId: string }): Promise<string | undefined> {
    return findCarrierName(this.transaction, params)
  }

  public findOperatorName(params: {
    readonly companyId: string
    readonly userId: string
  }): Promise<string | undefined> {
    return findOperatorName(this.transaction, params)
  }

  public async findIdempotency(params: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<OccurrenceMailIdempotencyRecord | null> {
    await acquireAdvisoryLock(this.transaction, [
      SEND_OCCURRENCE_MAIL_OPERATION,
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
          eq(idempotencyRecords.operation, SEND_OCCURRENCE_MAIL_OPERATION),
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
    readonly response: SendOccurrenceMailResult
  }): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: params.companyId,
      idempotencyKey: params.idempotencyKey,
      operation: SEND_OCCURRENCE_MAIL_OPERATION,
      requestFingerprint: params.fingerprint,
      response: params.response,
      status: 'succeeded',
    })
  }

  public async findMailSettings(params: {
    readonly companyId: string
  }): Promise<OccurrenceMailSettings | undefined> {
    const [row] = await this.transaction
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
        subject: params.subject,
        threadId: params.threadId,
        toAddresses: [...params.toAddresses],
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
    readonly authorUserId: string
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
