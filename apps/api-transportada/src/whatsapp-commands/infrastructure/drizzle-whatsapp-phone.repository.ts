/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'

import {
  userWhatsAppPhones,
  whatsAppPhoneVerificationRequests,
} from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  OpenWhatsAppPhoneVerificationInput,
  VerifiedWhatsAppPhone,
  WhatsAppPhoneBinding,
  WhatsAppPhoneRepositoryPort,
  WhatsAppPhoneVerificationRequest,
} from '../application/whatsapp-phone.port.js'
import { WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS } from '../domain/whatsapp-phone-verification.constant.js'
import { WhatsAppPhoneTakenError } from '../domain/whatsapp-phone.error.js'

type WhatsAppPhoneDatabase = ReturnType<typeof createDrizzleProvider>['db']

const VERIFIED_PHONE_UNIQUE = 'user_whatsapp_phones_phone_verified_unique'

const requests = whatsAppPhoneVerificationRequests

const REQUEST_COLUMNS = {
  attemptCount: requests.attemptCount,
  codeHash: requests.codeHash,
  companyId: requests.companyId,
  consumedAt: requests.consumedAt,
  expiresAt: requests.expiresAt,
  id: requests.id,
  phone: requests.phone,
  userId: requests.userId,
}

export function buildLiveRequestByUserFilters(input: {
  readonly companyId: string
  readonly userId: string
}): readonly SQL[] {
  return [
    eq(requests.companyId, input.companyId),
    eq(requests.userId, input.userId),
    isNull(requests.consumedAt),
  ]
}

export function buildLiveRequestByPhoneFilters(input: {
  readonly companyId: string
  readonly phone: string
}): readonly SQL[] {
  return [
    eq(requests.companyId, input.companyId),
    eq(requests.phone, input.phone),
    isNull(requests.consumedAt),
  ]
}

export function buildRequestWriteFilters(input: {
  readonly companyId: string
  readonly requestId: string
}): readonly SQL[] {
  return [
    eq(requests.companyId, input.companyId),
    eq(requests.id, input.requestId),
    isNull(requests.consumedAt),
  ]
}

export class DrizzleWhatsAppPhoneRepository implements WhatsAppPhoneRepositoryPort {
  public constructor(private readonly database: WhatsAppPhoneDatabase) {}

  public async findVerifiedByPhone(input: {
    readonly phone: string
  }): Promise<VerifiedWhatsAppPhone | undefined> {
    const [row] = await this.database
      .select({ userId: userWhatsAppPhones.userId, verifiedAt: userWhatsAppPhones.verifiedAt })
      .from(userWhatsAppPhones)
      .where(
        and(eq(userWhatsAppPhones.phone, input.phone), isNotNull(userWhatsAppPhones.verifiedAt)),
      )
      .limit(1)

    if (row?.verifiedAt === undefined || row.verifiedAt === null) return undefined
    return { userId: row.userId, verifiedAt: row.verifiedAt }
  }

  public async findByUserId(input: {
    readonly userId: string
  }): Promise<WhatsAppPhoneBinding | undefined> {
    const [row] = await this.database
      .select({
        phone: userWhatsAppPhones.phone,
        userId: userWhatsAppPhones.userId,
        verifiedAt: userWhatsAppPhones.verifiedAt,
      })
      .from(userWhatsAppPhones)
      .where(eq(userWhatsAppPhones.userId, input.userId))
      .limit(1)

    return row === undefined ? undefined : { ...row, verifiedAt: row.verifiedAt ?? undefined }
  }

  /** Quem decide a colisão é o índice parcial, não uma leitura antes: entre as duas cabe outra escrita. */
  public async saveVerified(input: {
    readonly phone: string
    readonly userId: string
    readonly verifiedAt: Date
  }): Promise<void> {
    const updatedAt = new Date()
    try {
      await this.database
        .insert(userWhatsAppPhones)
        .values({ phone: input.phone, userId: input.userId, verifiedAt: input.verifiedAt })
        .onConflictDoUpdate({
          set: { phone: input.phone, updatedAt, verifiedAt: input.verifiedAt },
          target: userWhatsAppPhones.userId,
        })
    } catch (error) {
      if (violatedUniqueConstraint(error) === VERIFIED_PHONE_UNIQUE) {
        throw new WhatsAppPhoneTakenError()
      }
      throw error
    }
  }

  public async unbindByUserId(input: { readonly userId: string }): Promise<void> {
    await this.database
      .delete(userWhatsAppPhones)
      .where(eq(userWhatsAppPhones.userId, input.userId))
  }

  /** `consumed_at` aqui significa *fechado*: é a coluna que o índice de pedido vivo observa. */
  public async openVerificationRequest(input: OpenWhatsAppPhoneVerificationInput): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(requests)
        .set({ consumedAt: new Date() })
        .where(and(...buildLiveRequestByUserFilters(input)))

      await transaction.insert(requests).values({
        codeHash: input.codeHash,
        companyId: input.companyId,
        expiresAt: input.expiresAt,
        id: input.id,
        phone: input.phone,
        userId: input.userId,
      })
    })
  }

  public async findLiveRequestByCompanyAndPhone(input: {
    readonly companyId: string
    readonly phone: string
  }): Promise<readonly WhatsAppPhoneVerificationRequest[]> {
    const rows = await this.database
      .select(REQUEST_COLUMNS)
      .from(requests)
      .where(and(...buildLiveRequestByPhoneFilters(input)))
      .orderBy(desc(requests.createdAt))

    return rows.map((row) => ({ ...row, consumedAt: row.consumedAt ?? undefined }))
  }

  /** O teto vai no `WHERE` para o contador nunca passar do limite que o CHECK conhece. */
  public async incrementAttempt(input: {
    readonly companyId: string
    readonly requestId: string
  }): Promise<void> {
    await this.database
      .update(requests)
      .set({ attemptCount: sql`${requests.attemptCount} + 1` })
      .where(
        and(
          ...buildRequestWriteFilters(input),
          sql`${requests.attemptCount} < ${WHATSAPP_PHONE_VERIFICATION_MAX_ATTEMPTS}`,
        ),
      )
  }

  public async consumeRequest(input: {
    readonly companyId: string
    readonly consumedAt: Date
    readonly requestId: string
  }): Promise<void> {
    await this.database
      .update(requests)
      .set({ consumedAt: input.consumedAt })
      .where(and(...buildRequestWriteFilters(input)))
  }
}
