/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 290: as fontes do quadro de mensagens enviadas. Cada uma conta no banco e devolve só agrupamentos — nenhuma
 * linha de mensagem, telefone ou e-mail sai daqui.
 *
 * ⚠️ O boleto que o sistema manda ao cliente NÃO é lido em `occurrence_contractor_reply_deliveries`: cada entrega que
 * sai grava a mensagem na conversa do cliente (`client_delivery_id`), e a fonte `occurrence_conversations` já a conta.
 * Somar as duas contaria o boleto duas vezes.
 */
import { sql, type SQL } from 'drizzle-orm'

import type {
  SentMessagesQuery,
  SentMessagesSource,
  SentMessagesSourceRow,
  SentMessagesStatus,
} from '../application/sent-messages.use-case.js'

type Runner = { execute(query: SQL): PromiseLike<unknown> }

/** Subcategoria quando a conversa não é de uma ocorrência (nota ou viagem) ou o tipo foi apagado. */
const NO_TYPE = 'sem_tipo'

export function createDrizzleSentMessagesSources(runner: Runner): readonly SentMessagesSource[] {
  return [
    {
      category: 'occurrence',
      key: 'occurrence_conversations',
      read: (query) => readOccurrenceConversations(runner, query),
    },
    {
      category: 'notification',
      key: 'notifications',
      read: (query) => readNotifications(runner, query),
    },
    {
      category: 'access',
      key: 'access_deliveries',
      read: (query) => readAccessDeliveries(runner, query),
    },
  ]
}

/**
 * Mensagens de saída das conversas: contratante, motorista, cliente (WhatsApp e e-mail), nota e viagem. A subcategoria é
 * o tipo da ocorrência (`company_occurrence_types.name`) e, quando não há ocorrência, o assunto da conversa. O participante
 * vai em `audience` para o painel separar "ao cliente" de "à contratante" sem misturar os canais.
 */
async function readOccurrenceConversations(
  runner: Runner,
  query: SentMessagesQuery,
): Promise<readonly SentMessagesSourceRow[]> {
  const rows = await rowsOf(
    runner,
    sql`select m.channel as channel,
               conversation.participant as participant,
               case when m.status in ('failed', 'bounced') then 'failed' else 'sent' end as status,
               coalesce(type.name, case conversation.subject_type when 'occurrence' then ${NO_TYPE} else conversation.subject_type end) as subcategory,
               count(*)::int as total
        from occurrence_conversation_messages m
        join occurrence_conversations conversation
          on conversation.company_id = m.company_id and conversation.id = m.conversation_id
        left join trip_stop_occurrences stop_occurrence
          on conversation.occurrence_kind = 'stop'
         and stop_occurrence.company_id = conversation.company_id and stop_occurrence.id = conversation.occurrence_id
        left join trip_document_occurrences document_occurrence
          on conversation.occurrence_kind = 'document'
         and document_occurrence.company_id = conversation.company_id and document_occurrence.id = conversation.occurrence_id
        left join company_occurrence_types type
          on type.company_id = conversation.company_id
         and type.id = coalesce(stop_occurrence.occurrence_type_id, document_occurrence.occurrence_type_id)
        where m.company_id = ${query.companyId}::uuid
          and m.direction = 'outbound'
          and m.status is not null and m.status <> 'queued'
          and m.created_at >= ${query.from.toISOString()}::timestamptz
          and m.created_at < ${query.to.toISOString()}::timestamptz
        group by 1, 2, 3, 4`,
  )
  return rows.flatMap((row) => {
    const channel = textOf(row.channel)
    const participant = textOf(row.participant)
    const subcategory = textOf(row.subcategory)
    if (channel === null || participant === null || subcategory === null) return []
    return [
      {
        audience: participant,
        category: 'occurrence',
        channel,
        count: Number(row.total ?? 0),
        status: statusOf(row.status),
        subcategory,
      },
    ]
  })
}

/** O módulo de notificação: uma linha por tentativa de entrega, com a chave do modelo como subcategoria. */
async function readNotifications(
  runner: Runner,
  query: SentMessagesQuery,
): Promise<readonly SentMessagesSourceRow[]> {
  const rows = await rowsOf(
    runner,
    sql`select delivery.channel as channel,
               notification.template_key as subcategory,
               case when delivery.status in ('failed', 'bounced', 'rejected') then 'failed' else 'sent' end as status,
               count(*)::int as total
        from notification.deliveries delivery
        join notification.notifications notification on notification.id = delivery.notification_id
        where delivery.company_id = ${query.companyId}::uuid
          and delivery.status in ('sent', 'delivered', 'read', 'failed', 'bounced', 'rejected')
          and coalesce(delivery.sent_at, delivery.failed_at, delivery.created_at) >= ${query.from.toISOString()}::timestamptz
          and coalesce(delivery.sent_at, delivery.failed_at, delivery.created_at) < ${query.to.toISOString()}::timestamptz
        group by 1, 2, 3`,
  )
  return rows.flatMap((row) => {
    const channel = textOf(row.channel)
    const subcategory = textOf(row.subcategory)
    if (channel === null || subcategory === null) return []
    return [
      {
        category: 'notification',
        channel,
        count: Number(row.total ?? 0),
        status: statusOf(row.status),
        subcategory,
      },
    ]
  })
}

/**
 * Convite e redefinição de senha. A fonte é a caixa de saída de cada fluxo: `published_at` é o instante em que o evento foi
 * entregue ao envio, não a confirmação do provedor — por isso a categoria diz "entregue ao envio" no painel. Código de
 * WhatsApp e de e-mail de verificação não deixam rastro, então ficam fora (T5 abre a decisão de registrá-los).
 */
async function readAccessDeliveries(
  runner: Runner,
  query: SentMessagesQuery,
): Promise<readonly SentMessagesSourceRow[]> {
  const rows = await rowsOf(
    runner,
    sql`select 'invitation' as subcategory, count(*)::int as total
        from invitation_delivery_outbox
        where company_id = ${query.companyId}::uuid and published_at is not null
          and published_at >= ${query.from.toISOString()}::timestamptz
          and published_at < ${query.to.toISOString()}::timestamptz
        union all
        select 'password_reset' as subcategory, count(*)::int as total
        from password_reset_delivery_outbox
        where company_id = ${query.companyId}::uuid and published_at is not null
          and published_at >= ${query.from.toISOString()}::timestamptz
          and published_at < ${query.to.toISOString()}::timestamptz`,
  )
  return rows.flatMap((row) => {
    const subcategory = textOf(row.subcategory)
    const count = Number(row.total ?? 0)
    if (subcategory === null || count <= 0) return []
    return [{ category: 'access', channel: 'email', count, status: 'sent', subcategory }]
  })
}

async function rowsOf(runner: Runner, query: SQL): Promise<readonly Record<string, unknown>[]> {
  return (await runner.execute(query)) as readonly Record<string, unknown>[]
}

function textOf(value: unknown): null | string {
  return typeof value === 'string' && value !== '' ? value : null
}

function statusOf(value: unknown): SentMessagesStatus {
  return value === 'failed' ? 'failed' : 'sent'
}
