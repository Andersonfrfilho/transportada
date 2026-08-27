/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'

import { contractors, deliveryClients } from '../../database/delivery-client.schema.js'
import {
  resolveDeliveryRegistryCandidates,
  type DeliveryRegistryCandidate,
  type NfeRegistryParty,
} from '../domain/delivery-registry.policy.js'
import type { NfeWriteTransaction } from './drizzle-nfe-import-consumer.repository.js'

export type DeliveryRegistryLogger = {
  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void
}

export type EnsureDeliveryRegistryParams = {
  readonly companyId: string
  readonly logger?: DeliveryRegistryLogger
  readonly parties: readonly NfeRegistryParty[]
  readonly tx: NfeWriteTransaction
}

/**
 * ADR-0048 §1: o cadastro é conveniência; **a nota é o produto**. Por isso a escrita corre dentro de
 * um `SAVEPOINT` próprio (a transação aninhada do Drizzle): se ela falhar — unique novo, coluna que
 * mudou na API e não aqui, o que for —, o savepoint volta e a importação segue como se nada tivesse
 * acontecido. Sem ele, um erro aqui abortaria a transação inteira e a **nota não entraria**.
 *
 * Idempotente por `(company_id, tax_id)`: a segunda nota do mesmo CNPJ atualiza o nome visto e nada
 * mais. Janela, taxa e agendamento não são sequer mencionados — é assim que a criação automática
 * nunca sobrescreve o que gente preencheu.
 */
export async function ensureDeliveryRegistry(input: EnsureDeliveryRegistryParams): Promise<void> {
  const candidates = resolveDeliveryRegistryCandidates(input.parties)
  if (candidates.contractor === null && candidates.deliveryClient === null) return

  try {
    await input.tx.transaction(async (savepoint) => {
      if (candidates.deliveryClient !== null) {
        await upsert({
          candidate: candidates.deliveryClient,
          companyId: input.companyId,
          table: deliveryClients,
          tx: savepoint,
        })
      }
      if (candidates.contractor !== null) {
        await upsert({
          candidate: candidates.contractor,
          companyId: input.companyId,
          table: contractors,
          tx: savepoint,
        })
      }
    })
  } catch (error) {
    // Nunca o documento, nunca o nome: o que sobe é a causa e a empresa (`security.md` §1).
    input.logger?.warn('delivery_registry_upsert_failed', {
      companyId: input.companyId,
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

async function upsert(input: {
  readonly candidate: DeliveryRegistryCandidate
  readonly companyId: string
  readonly table: typeof deliveryClients | typeof contractors
  readonly tx: NfeWriteTransaction
}): Promise<void> {
  await input.tx
    .insert(input.table)
    .values({
      companyId: input.companyId,
      displayName: input.candidate.displayName,
      taxId: input.candidate.taxId,
    })
    .onConflictDoUpdate({
      set: { displayName: input.candidate.displayName, updatedAt: new Date() },
      /**
       * Nome vazio não apaga o que já se sabia: a nota de distribuição chega com o resumo, sem razão
       * social, e deixá-la sobrescrever trocaria o nome do cliente por nada.
       */
      setWhere: sql`length(${sql.raw(`excluded."display_name"`)}) > 0 and ${input.table.displayName} <> ${input.candidate.displayName}`,
      target: [input.table.companyId, input.table.taxId],
    })
}
