/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull, sql } from 'drizzle-orm'

import {
  identityUserProfiles,
  identityUsers,
  passwordResetRequests,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import type {
  ActiveResetTarget,
  CreatePasswordResetInput,
  PasswordResetRepositoryPort,
} from '../application/password-reset.port.js'
import { PASSWORD_RESET_MAX_ATTEMPTS } from '../domain/password-reset.constant.js'
import type { PasswordResetSnapshot } from '../domain/password-reset.policy.js'

type PasswordResetDatabase = ReturnType<typeof createDrizzleProvider>['db']

const REQUEST_COLUMNS = {
  attemptCount: passwordResetRequests.attemptCount,
  codeHash: passwordResetRequests.codeHash,
  companyId: passwordResetRequests.companyId,
  consumedAt: passwordResetRequests.consumedAt,
  expiresAt: passwordResetRequests.expiresAt,
  id: passwordResetRequests.id,
  userId: passwordResetRequests.userId,
}

export class DrizzlePasswordResetRepository implements PasswordResetRepositoryPort {
  public constructor(private readonly database: PasswordResetDatabase) {}

  /**
   * Fechar o pedido anterior e abrir o novo acontecem na mesma transação: o índice parcial de
   * pedido vivo recusaria o segundo, e duas escritas soltas deixariam a janela em que nenhum vale.
   *
   * `consumed_at` aqui significa *fechado*, não *código usado* — é a coluna que o índice parcial
   * observa, e pedido substituído deixa de ser o pedido vivo daquele usuário.
   */
  public async create(input: CreatePasswordResetInput): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const closedAt = new Date()

      await transaction
        .update(passwordResetRequests)
        .set({ consumedAt: closedAt, updatedAt: closedAt })
        .where(
          and(
            eq(passwordResetRequests.companyId, input.companyId),
            eq(passwordResetRequests.userId, input.userId),
            isNull(passwordResetRequests.consumedAt),
          ),
        )

      await transaction.insert(passwordResetRequests).values({
        codeHash: input.codeHash,
        companyId: input.companyId,
        expiresAt: input.expiresAt,
        id: input.id,
        sealedCode: input.sealedCode,
        userId: input.userId,
      })
    })
  }

  /**
   * Usuário e vínculo precisam estar **ativos**. Login inexistente, usuário desabilitado e vínculo
   * inativo saem daqui como a mesma lista vazia — é aqui que os três deixam de ser distinguíveis.
   */
  public async findActiveTargets(input: {
    readonly username: string
  }): Promise<readonly ActiveResetTarget[]> {
    const rows = await this.database
      .select({
        companyId: userCompanyMemberships.companyId,
        userId: userCompanyMemberships.userId,
      })
      .from(identityUserProfiles)
      .innerJoin(identityUsers, eq(identityUsers.id, identityUserProfiles.userId))
      .innerJoin(
        userCompanyMemberships,
        eq(userCompanyMemberships.userId, identityUserProfiles.userId),
      )
      .where(
        and(
          eq(identityUserProfiles.username, input.username),
          eq(identityUsers.status, 'active'),
          eq(userCompanyMemberships.status, 'active'),
        ),
      )

    return rows
  }

  public async findByCodeHash(input: {
    readonly codeHash: string
  }): Promise<PasswordResetSnapshot | undefined> {
    const [row] = await this.database
      .select(REQUEST_COLUMNS)
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.codeHash, input.codeHash))
      .limit(1)

    return row === undefined ? undefined : { ...row, consumedAt: row.consumedAt ?? undefined }
  }

  public async markConsumed(input: {
    readonly companyId: string
    readonly consumedAt: Date
    readonly requestId: string
  }): Promise<void> {
    await this.database
      .update(passwordResetRequests)
      .set({ consumedAt: input.consumedAt, updatedAt: new Date() })
      .where(
        and(
          eq(passwordResetRequests.id, input.requestId),
          eq(passwordResetRequests.companyId, input.companyId),
          isNull(passwordResetRequests.consumedAt),
        ),
      )
  }

  /** O teto vai no `WHERE` para o contador nunca passar do limite que o CHECK e a policy conhecem. */
  public async registerFailedAttempt(input: { readonly requestId: string }): Promise<void> {
    await this.database
      .update(passwordResetRequests)
      .set({
        attemptCount: sql`${passwordResetRequests.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(passwordResetRequests.id, input.requestId),
          isNull(passwordResetRequests.consumedAt),
          sql`${passwordResetRequests.attemptCount} < ${PASSWORD_RESET_MAX_ATTEMPTS}`,
        ),
      )
  }
}
