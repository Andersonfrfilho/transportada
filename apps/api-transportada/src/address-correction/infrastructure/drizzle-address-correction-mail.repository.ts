/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * T304 (RF6): uma transação só cria a conversa, grava a mensagem e o outbox, e marca os pedidos
 * como `sent` — nenhuma decisão de negócio mora aqui (isso é do caso de uso), só leitura e escrita.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  addressCorrectionRequests,
  companyFiscalProfiles,
  CONTRACTOR_CONTACT_STATUSES,
  CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES,
  contractorContacts,
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailSettings,
  contractorMailTemplates,
  contractorMailThreads,
  contractors,
  identityUserProfiles,
  idempotencyRecords,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import {
  ADDRESS_CORRECTION_MAIL_TYPE,
  CONTRACTOR_MAIL_TEMPLATE_STATUSES,
} from '../../contractor-mail/domain/mail-template-catalog.constant.js'
import type {
  AddressCorrectionMailContact,
  AddressCorrectionMailContractor,
  AddressCorrectionMailIdempotencyRecord,
  AddressCorrectionMailSettings,
  AddressCorrectionMailTemplate,
  AddressCorrectionMailTransactionPort,
  AddressCorrectionMailUnitOfWorkPort,
  FindSendableAddressCorrectionRequestsResult,
  RecordAddressCorrectionMailInput,
  SendAddressCorrectionMailResult,
} from '../application/address-correction-mail.port.js'
import type { AddressCorrectionRequest } from '../application/address-correction.port.js'
import { ADDRESS_CORRECTION_SEND_MAIL_OPERATION } from '../domain/address-correction-mail.constant.js'
import {
  AddressCorrectionMailMessageNotPersistedError,
  AddressCorrectionRequestNotSendableError,
} from '../domain/address-correction.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const OPERATION = ADDRESS_CORRECTION_SEND_MAIL_OPERATION
const DRAFT_STATUS = 'draft'
const SENT_STATUS = 'sent'
const OUTBOUND_DIRECTION = 'outbound'
const QUEUED_DELIVERY_STATUS = 'queued'
const ADDRESS_CORRECTION_SUBJECT_TYPE = 'address_correction'
const ACTIVE_CONTACT_STATUS = CONTRACTOR_CONTACT_STATUSES[0]
const [ACTIVE_TEMPLATE_STATUS] = CONTRACTOR_MAIL_TEMPLATE_STATUSES
const [MESSAGE_SEND_REQUESTED_EVENT_TYPE] = CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES

export class DrizzleAddressCorrectionMailRepository implements AddressCorrectionMailUnitOfWorkPort {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: AddressCorrectionMailTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(new AddressCorrectionMailDrizzleTransaction(transaction)),
    )
  }
}

class AddressCorrectionMailDrizzleTransaction implements AddressCorrectionMailTransactionPort {
  public constructor(private readonly transaction: Transaction) {}

  public async findContractorByTaxId(params: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<AddressCorrectionMailContractor | undefined> {
    const [row] = await this.transaction
      .select({ displayName: contractors.displayName, id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.companyId, params.companyId), eq(contractors.taxId, params.taxId)))
      .limit(1)
    return row
  }

  public async findMailSettings(params: {
    readonly companyId: string
  }): Promise<AddressCorrectionMailSettings | undefined> {
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

  /** `company_id`, tipo e `active` na mesma condição do id — nunca o id sozinho (T402, tenant). */
  public async findMailTemplate(params: {
    readonly companyId: string
    readonly templateId?: string
  }): Promise<AddressCorrectionMailTemplate | undefined> {
    const [row] = await this.transaction
      .select({
        closing: contractorMailTemplates.closing,
        id: contractorMailTemplates.id,
        intro: contractorMailTemplates.intro,
        itemText: contractorMailTemplates.itemText,
        subject: contractorMailTemplates.subject,
      })
      .from(contractorMailTemplates)
      .where(
        and(
          eq(contractorMailTemplates.companyId, params.companyId),
          eq(contractorMailTemplates.mailType, ADDRESS_CORRECTION_MAIL_TYPE),
          eq(contractorMailTemplates.status, ACTIVE_TEMPLATE_STATUS),
          params.templateId === undefined
            ? eq(contractorMailTemplates.isDefault, true)
            : eq(contractorMailTemplates.id, params.templateId),
        ),
      )
      .limit(1)
    return row
  }

  public async findActiveContactsByIds(params: {
    readonly companyId: string
    readonly contactIds: readonly string[]
    readonly contractorId: string
  }): Promise<readonly AddressCorrectionMailContact[]> {
    if (params.contactIds.length === 0) return []
    return this.transaction
      .select({ email: contractorContacts.email, id: contractorContacts.id })
      .from(contractorContacts)
      .where(
        and(
          eq(contractorContacts.companyId, params.companyId),
          eq(contractorContacts.contractorId, params.contractorId),
          eq(contractorContacts.status, ACTIVE_CONTACT_STATUS),
          inArray(contractorContacts.id, [...params.contactIds]),
        ),
      )
  }

  public async findSendableRequests(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly requestIds: readonly string[] | undefined
  }): Promise<FindSendableAddressCorrectionRequestsResult> {
    if (params.requestIds === undefined) {
      const rows = await this.transaction
        .select()
        .from(addressCorrectionRequests)
        .where(
          and(
            eq(addressCorrectionRequests.companyId, params.companyId),
            eq(addressCorrectionRequests.contractorId, params.contractorId),
            eq(addressCorrectionRequests.status, DRAFT_STATUS),
          ),
        )
        // Rodada de correção da Fase 4: `ORDER BY` antes do `FOR UPDATE` fixa a ordem de trava das
        // linhas — sem ele, um envio completo (por contratante) e um unitário (por lista de ids)
        // que travam o mesmo par de rascunhos podem pegá-los em ordem oposta e deadlockar sob
        // concorrência (Postgres derruba um dos dois com `40P01`, que virava 500).
        .orderBy(addressCorrectionRequests.id)
        .for('update')
      return { invalidRequestIds: [], sendable: rows.map(toAddressCorrectionRequest) }
    }

    const requestedIds = [...new Set(params.requestIds)]
    const rows =
      requestedIds.length === 0
        ? []
        : await this.transaction
            .select()
            .from(addressCorrectionRequests)
            .where(
              and(
                eq(addressCorrectionRequests.companyId, params.companyId),
                inArray(addressCorrectionRequests.id, requestedIds),
              ),
            )
            .orderBy(addressCorrectionRequests.id)
            .for('update')
    const rowById = new Map(rows.map((row) => [row.id, row]))
    const sendable: AddressCorrectionRequest[] = []
    const invalidRequestIds: string[] = []
    for (const id of requestedIds) {
      const row = rowById.get(id)
      if (
        row === undefined ||
        row.contractorId !== params.contractorId ||
        row.status !== DRAFT_STATUS
      ) {
        invalidRequestIds.push(id)
        continue
      }
      sendable.push(toAddressCorrectionRequest(row))
    }
    return { invalidRequestIds, sendable }
  }

  public async findCarrierName(params: {
    readonly companyId: string
  }): Promise<string | undefined> {
    const [row] = await this.transaction
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

  public async findOperatorName(params: {
    readonly companyId: string
    readonly userId: string
  }): Promise<string | undefined> {
    const [row] = await this.transaction
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

  public async findIdempotency(params: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<AddressCorrectionMailIdempotencyRecord | null> {
    await acquireAdvisoryLock(this.transaction, [
      'address-correction-mail',
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
          eq(idempotencyRecords.operation, OPERATION),
          eq(idempotencyRecords.idempotencyKey, params.idempotencyKey),
        ),
      )
      .limit(1)
    if (row === undefined) return null
    return {
      fingerprint: row.fingerprint,
      response: row.response as SendAddressCorrectionMailResult,
    }
  }

  public async saveIdempotency(params: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly response: SendAddressCorrectionMailResult
  }): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: params.companyId,
      idempotencyKey: params.idempotencyKey,
      operation: OPERATION,
      requestFingerprint: params.fingerprint,
      response: params.response,
      status: 'succeeded',
    })
  }

  /** RF6: a conversa, a mensagem `queued` e o evento de outbox, todos nesta transação. */
  public async recordMail(
    params: RecordAddressCorrectionMailInput,
  ): Promise<{ readonly messageId: string }> {
    await this.transaction.insert(contractorMailThreads).values({
      companyId: params.companyId,
      contractorId: params.contractorId,
      id: params.threadId,
      replyTokenHash: params.replyTokenHash,
      subjectId: params.threadId,
      subjectType: ADDRESS_CORRECTION_SUBJECT_TYPE,
    })

    const [message] = await this.transaction
      .insert(contractorMailMessages)
      .values({
        actorUserId: params.actorUserId,
        bodyHtml: params.bodyHtml,
        bodyText: params.bodyText,
        companyId: params.companyId,
        deliveryStatus: QUEUED_DELIVERY_STATUS,
        direction: OUTBOUND_DIRECTION,
        fromAddress: params.fromAddress,
        subject: params.subject,
        templateId: params.templateId,
        threadId: params.threadId,
        toAddresses: [...params.toAddresses],
      })
      .returning({ id: contractorMailMessages.id })
    if (message === undefined) throw new AddressCorrectionMailMessageNotPersistedError()

    await this.transaction.insert(contractorMailOutbox).values({
      companyId: params.companyId,
      correlationId: params.correlationId,
      eventType: MESSAGE_SEND_REQUESTED_EVENT_TYPE,
      messageId: message.id,
      payload: {},
    })

    return { messageId: message.id }
  }

  /**
   * As linhas já vieram travadas (`for('update')`) por `findSendableRequests` nesta mesma
   * transação — o `eq(status, 'draft')` aqui é a segunda trava: um envio concorrente do mesmo
   * rascunho que tenha vencido a corrida já marcou `sent` e libera o lock antes deste `UPDATE`
   * rodar, então menos linhas voltam do que as pedidas. Nesse caso a transação inteira desfaz (409).
   */
  public async markRequestsSent(params: {
    readonly companyId: string
    readonly requestIds: readonly string[]
    readonly threadId: string
  }): Promise<void> {
    if (params.requestIds.length === 0) return
    const updated = await this.transaction
      .update(addressCorrectionRequests)
      .set({ sentAt: sql`now()`, status: SENT_STATUS, threadId: params.threadId })
      .where(
        and(
          eq(addressCorrectionRequests.companyId, params.companyId),
          inArray(addressCorrectionRequests.id, [...params.requestIds]),
          eq(addressCorrectionRequests.status, DRAFT_STATUS),
        ),
      )
      .returning({ id: addressCorrectionRequests.id })
    if (updated.length !== params.requestIds.length) {
      throw new AddressCorrectionRequestNotSendableError()
    }
  }
}

type AddressCorrectionRow = typeof addressCorrectionRequests.$inferSelect

function toAddressCorrectionRequest(row: AddressCorrectionRow): AddressCorrectionRequest {
  return {
    actorUserId: row.actorUserId,
    addressKey: row.addressKey,
    companyId: row.companyId,
    contractorId: row.contractorId,
    createdAt: row.createdAt,
    id: row.id,
    proposed: {
      city: row.proposedCity,
      cityCode: row.proposedCityCode,
      complement: row.proposedComplement,
      district: row.proposedDistrict,
      number: row.proposedNumber,
      postalCode: row.proposedPostalCode,
      state: row.proposedState,
      street: row.proposedStreet,
    },
    reasonDistanceMetres: row.reasonDistanceMetres,
    reasonMatchLevel: row.reasonMatchLevel,
    /** Sempre `draft` aqui (a leitura é `findSendableRequests`, antes de enviar). */
    recipientCount: null,
    recipientName: row.recipientName,
    reported: {
      city: row.reportedCity,
      cityCode: row.reportedCityCode,
      complement: row.reportedComplement,
      district: row.reportedDistrict,
      number: row.reportedNumber,
      postalCode: row.reportedPostalCode,
      state: row.reportedState,
      street: row.reportedStreet,
    },
    sentAt: row.sentAt,
    status: row.status,
    threadId: row.threadId,
    updatedAt: row.updatedAt,
  }
}

async function acquireAdvisoryLock(
  transaction: Transaction,
  fields: readonly string[],
): Promise<void> {
  const encoded = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}
