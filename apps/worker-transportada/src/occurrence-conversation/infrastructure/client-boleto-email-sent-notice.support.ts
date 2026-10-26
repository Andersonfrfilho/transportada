/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T6b (RF12): quando o e-mail do boleto ao cliente sai, a conversa do motorista da ocorrência ganha a mensagem
 * do sistema "Boleto enviado para o e-mail: fulano@…" — uma por entrega (por endereço), com a hora (a da mensagem) e quem
 * enviou (`system_notice`: o escritório, o motorista pelo app ou o Sistema, no envio automático). O endereço aparece por
 * inteiro só aqui, na conversa da própria empresa; nenhum log nem evento o leva.
 *
 * ⚠️ SQL puro, na mesma transação que fecha a entrega como `sent`. Idempotente pelo índice único por entrega: repetir o
 * fechamento não grava outro aviso. Ocorrência sem conversa do motorista não ganha aviso (o estado Enviado continua na
 * entrega, que o painel mostra); o aviso nunca cria a conversa.
 */
import { sql, type SQL } from 'drizzle-orm'

export type ClientBoletoEmailSentNoticeRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

const TARGET = 'client_boleto_emails'
const NOTICE_KIND = 'client_boleto_email_sent'
/** O texto que o app e o painel mostram; o `system_notice` guarda o resto (quem enviou e qual entrega). */
const BODY_PREFIX = 'Boleto enviado para o e-mail: '

export async function recordClientBoletoEmailSentNotice(
  runner: ClientBoletoEmailSentNoticeRunner,
  params: { readonly companyId: string; readonly mailMessageId: string },
): Promise<void> {
  const { companyId, mailMessageId } = params
  await runner.execute(
    sql`insert into occurrence_conversation_messages
          (company_id, conversation_id, channel, direction, automatic, body_text, status, status_times, system_notice)
        select d.company_id, c.id, 'app', 'outbound', true,
               ${BODY_PREFIX} || d.address,
               'delivered',
               jsonb_build_object('delivered', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
               jsonb_build_object(
                 'kind', ${NOTICE_KIND}::text,
                 'deliveryId', d.id::text,
                 'actorKind', case
                   when d.actor_user_id is null then 'system'
                   when d.actor_user_id = c.driver_user_id then 'driver'
                   else 'office' end,
                 'actorName', case when d.actor_user_id is null then null else profile.name end)
          from occurrence_contractor_reply_deliveries d
          join occurrence_contractor_replies r
            on r.company_id = d.company_id and r.id = d.reply_id
          join occurrence_conversations c
            on c.company_id = r.company_id and c.occurrence_kind = 'document'
           and c.occurrence_id = r.occurrence_id and c.participant = 'driver'
          left join identity_user_profiles profile on profile.user_id = d.actor_user_id
         where d.company_id = ${companyId}::uuid
           and d.mail_message_id = ${mailMessageId}::uuid
           and d.target = ${TARGET}
           and d.status = 'sent'
           and d.address is not null
        on conflict do nothing`,
  )
}
