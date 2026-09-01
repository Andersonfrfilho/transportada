/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { NonceStoreInterface } from '@adatechnology/meta-whatsapp-module'
import { sql } from 'drizzle-orm'

import { whatsappWebhookNonces } from '../../database/whatsapp-channel.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const MILLISECONDS_PER_SECOND = 1_000

/**
 * Spec 062 T006 — o `SET NX` que a porta do módulo pede, feito em Postgres.
 *
 * ⚠️ **Um `select` seguido de `insert` não serve**, e é por isso que a porta exige atomicidade: duas
 * entregas simultâneas leriam "ausente" e as duas seguiriam. Aqui quem decide é o `on conflict`, num
 * comando só — o banco serializa, não o processo.
 *
 * A chave vencida **é substituída**, não ignorada: o `where` do `do update` só deixa passar quando a
 * linha antiga já expirou. Sem isso a tabela viraria um bloqueio permanente por assinatura, e a
 * limpeza teria de virar job — para uma janela de cinco minutos, isso é encanamento a mais.
 */
export function createDrizzleWebhookNonceStore(database: Database): NonceStoreInterface {
  return {
    async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
      const expiresAt = new Date(Date.now() + ttlSeconds * MILLISECONDS_PER_SECOND)
      const claimed = await database
        .insert(whatsappWebhookNonces)
        .values({ expiresAt, key })
        .onConflictDoUpdate({
          set: { expiresAt },
          target: whatsappWebhookNonces.key,
          where: sql`${whatsappWebhookNonces.expiresAt} <= now()`,
        })
        .returning({ key: whatsappWebhookNonces.key })

      return claimed.length > 0
    },
  }
}
