/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 289: reserva atômica da próxima vaga de envio do número. Um `UPDATE` só lê a vaga atual e grava a seguinte,
 * então dois processos nunca recebem o mesmo instante.
 */
import { sql, type SQL } from 'drizzle-orm'

type Runner = { execute(query: SQL): PromiseLike<unknown> }

export function createDrizzleEvolutionSendSlotClaimer(runner: Runner) {
  return async (companyId: string): Promise<Date | null> => {
    const rows = (await runner.execute(
      sql`with current_slot as (
            select id, greatest(clock_timestamp(), coalesce(next_send_at, clock_timestamp())) as slot
            from whatsapp_evolution_settings where company_id = ${companyId}::uuid for update
          )
          update whatsapp_evolution_settings settings
          set next_send_at = current_slot.slot + make_interval(secs => settings.min_interval_seconds)
          from current_slot where settings.id = current_slot.id
          returning current_slot.slot as slot`,
    )) as readonly Record<string, unknown>[]
    const slot = rows[0]?.slot
    if (slot instanceof Date) return slot
    if (typeof slot === 'string') return new Date(slot)
    return null
  }
}
