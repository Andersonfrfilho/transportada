/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 289: o espaçamento entre envios do número da empresa. Cada envio reserva uma vaga no banco
 * (`whatsapp_evolution_settings.next_send_at`), `min_interval_seconds` depois da vaga anterior, e só sai quando a
 * vaga chega. Dois processos (API e worker) dividem a mesma fila de vagas. Se a vaga fica além do que o chamador
 * aguenta esperar, o envio é recusado — nunca fura o intervalo.
 */
import { sql, type SQL } from 'drizzle-orm'
export class EvolutionSendPacerBusyError extends Error {
  public constructor() {
    super('Evolution send slot is too far ahead')
    this.name = 'EvolutionSendPacerBusyError'
  }
}

export type EvolutionSendPacer = {
  /** Resolve quando o número pode enviar; rejeita com `EvolutionSendPacerBusyError` se a espera passa do limite. */
  readonly wait: (companyId: string) => Promise<void>
}

export function createEvolutionSendPacer(dependencies: {
  /** Reserva a próxima vaga e devolve o instante dela; `null` quando a empresa não tem configuração. */
  readonly claimSlot: (companyId: string) => Promise<Date | null>
  readonly maxWaitMs: number
  readonly now?: () => Date
  readonly sleep?: (milliseconds: number) => Promise<void>
}): EvolutionSendPacer {
  const now = dependencies.now ?? (() => new Date())
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  return {
    async wait(companyId) {
      const slot = await dependencies.claimSlot(companyId)
      if (slot === null) return
      const delay = slot.getTime() - now().getTime()
      if (delay <= 0) return
      // A vaga já foi reservada: recusar aqui deixa um buraco de um intervalo na fila, que é o preço de não esperar demais.
      if (delay > dependencies.maxWaitMs) throw new EvolutionSendPacerBusyError()
      await sleep(delay)
    },
  }
}

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
