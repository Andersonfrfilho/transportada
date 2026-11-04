/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'

import type { ApiLogger } from '../../shared/api.types.js'
import type { GroupReplySenderPort } from '../application/whatsapp-group-request.port.js'

export const GROUP_REQUEST_EXPIRY_TEXT = {
  expired:
    '⏰ Não recebi resposta e encerrei este pedido. Para recomeçar, é só me marcar de novo. 🙂',
  warning:
    '⏳ Ainda estou aguardando a resposta do pedido. Se ninguém responder nos próximos minutos, eu encerro por aqui.',
} as const

type Row = { readonly company_id: string; readonly group_jid: string }

type Database = {
  execute(query: ReturnType<typeof sql>): PromiseLike<unknown>
}

/**
 * Spec 292 T4 (regra 5): o pedido do grupo vence por tempo sem resposta. Antes o vencimento era só preguiçoso
 * (quem lia fechava) e ninguém era avisado. Este vigia, a cada `intervalMs`, avisa uma vez quando faltam
 * `warnSeconds` para vencer e, passado o prazo, fecha como `expired` e avisa o grupo. As duas passagens são um
 * único `update … returning`: com mais de uma réplica, só uma reivindica cada pedido e manda o aviso.
 * Um retorno ao pedido (resposta do dono) renova o prazo e regrava o `state`, então o aviso volta a valer.
 */
export function startGroupRequestExpiryWatcher(dependencies: {
  readonly database: Database
  readonly intervalMs?: number
  readonly logger: ApiLogger
  readonly now?: () => Date
  readonly replies: GroupReplySenderPort
  readonly warnSeconds?: number
}): { readonly stop: () => void; readonly tick: () => Promise<void> } {
  const { database, logger, replies } = dependencies
  const warnSeconds = dependencies.warnSeconds ?? 120
  const clock = dependencies.now ?? (() => new Date())

  async function tick(): Promise<void> {
    const now = clock()
    try {
      const expired = (await database.execute(
        sql`update whatsapp_group_requests
            set status = 'expired', closed_at = ${now.toISOString()}::timestamptz, version = version + 1
            where status = 'open' and expires_at <= ${now.toISOString()}::timestamptz
            returning company_id, group_jid`,
      )) as readonly Row[]
      for (const row of expired) {
        replies.send({
          companyId: row.company_id,
          groupJid: row.group_jid,
          texts: [GROUP_REQUEST_EXPIRY_TEXT.expired],
        })
      }
      const warned = (await database.execute(
        sql`update whatsapp_group_requests
            set state = state || '{"expiryWarned": true}'::jsonb
            where status = 'open'
              and expires_at > ${now.toISOString()}::timestamptz
              and expires_at <= ${now.toISOString()}::timestamptz + make_interval(secs => ${warnSeconds})
              and not (state ? 'expiryWarned')
            returning company_id, group_jid`,
      )) as readonly Row[]
      for (const row of warned) {
        replies.send({
          companyId: row.company_id,
          groupJid: row.group_jid,
          texts: [GROUP_REQUEST_EXPIRY_TEXT.warning],
        })
      }
      if (expired.length > 0 || warned.length > 0) {
        logger.info('whatsapp_group_request.expiry_notice', {
          expired: expired.length,
          warned: warned.length,
        })
      }
    } catch (error) {
      logger.warn('whatsapp_group_request.expiry_failed', {
        errorName: error instanceof Error ? error.name : typeof error,
      })
    }
  }

  const timer = setInterval(() => void tick(), dependencies.intervalMs ?? 30_000)
  timer.unref()
  return { stop: () => clearInterval(timer), tick }
}
