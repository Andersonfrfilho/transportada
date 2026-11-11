/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { ExpireDueWhatsAppChats } from '../application/whatsapp-inbox-expire.port.js'

export type WhatsAppInboxExpireDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * ⚠️ Espelha `expireDue` de `drizzle-whatsapp-chat.repository.ts` da API (SQL por valor, sem schema copiado): mesmas
 * condições e mesma devolução (`release_reason = 'expired'`, sem autor). `skip locked` deixa duas réplicas varrerem sem
 * se esperar, e o `UPDATE` da API que renova o prazo no mesmo instante vence a corrida porque a linha está travada.
 * A paridade é cobrada por `test/whatsapp-inbox-expire/sql-parity.contract.ts`.
 */
export function createDrizzleExpireDueWhatsAppChats(
  database: WhatsAppInboxExpireDatabase,
): ExpireDueWhatsAppChats {
  return async ({ limit, now }) => {
    const rows = await database.execute(sql`
      with due as (
        select id
        from whatsapp_chats
        where state = 'operator' and expires_at <= ${now.toISOString()}::timestamptz
        order by expires_at
        limit ${limit}::integer
        for update skip locked
      )
      update whatsapp_chats as chat
      set state = 'bot',
          taken_over_by_user_id = null,
          taken_over_at = null,
          expires_at = null,
          release_reason = 'expired',
          released_at = ${now.toISOString()}::timestamptz,
          released_by_user_id = null,
          updated_at = now()
      from due
      where chat.id = due.id
      returning 1
    `)
    return rows.length
  }
}
