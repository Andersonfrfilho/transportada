/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T2 (RF2): leitura e escrita da matriz "Retorno ao cliente" do tipo de ocorrência, sempre pela empresa do
 * contexto. A leitura é em lote — uma consulta para N tipos —, e tipo sem linha lê o derivado dos campos antigos.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { NOTIFICATION_SCHEMA } from '../../database/notification-migration.service.js'
import { companyOccurrenceTypeClientChannels } from '../../database/occurrence-type-client-channel.schema.js'
import { NOTIFICATION_DEFAULT_LOCALE } from '../../notification/notification.constant.js'
import {
  CLIENT_CHANNEL_DEFAULT,
  CLIENT_EMAIL_SEND_MODE_DEFAULT,
  CLIENT_EMAIL_TYPE_DEFAULT,
  type ClientChannel,
  type ClientEmailSendMode,
  type ClientEmailType,
} from '../../shared/delivery-client-email.constant.js'
import type { OccurrenceClientChannel } from '../../shared/occurrence-client-channel.constant.js'
import type { ClientChannelTemplateContent } from '../domain/occurrence-client-channel-template.policy.js'
import {
  OCCURRENCE_CLIENT_CHANNEL_ORDER,
  resolveClientChannelMatrix,
  type OccurrenceClientChannelMatrix,
  type OccurrenceClientChannelSetting,
} from '../domain/occurrence-client-channels.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

type StoredMatrix = Partial<Record<OccurrenceClientChannel, OccurrenceClientChannelSetting>>

/** O que a leitura tolerante precisa do tipo; ausente é o padrão da coluna. */
export type ClientChannelLegacyRecord = {
  readonly clientChannel?: ClientChannel | undefined
  readonly clientEmailSendMode?: ClientEmailSendMode | undefined
  readonly clientEmailType?: ClientEmailType | undefined
  readonly id: string
}

/** O gravado, por tipo; tipo sem linha fica fora do mapa. */
export async function readOccurrenceTypeClientChannels(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeIds: readonly string[] },
): Promise<ReadonlyMap<string, StoredMatrix>> {
  if (params.occurrenceTypeIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      channel: companyOccurrenceTypeClientChannels.channel,
      enabled: companyOccurrenceTypeClientChannels.enabled,
      occurrenceTypeId: companyOccurrenceTypeClientChannels.occurrenceTypeId,
      sendMode: companyOccurrenceTypeClientChannels.sendMode,
      templateKey: companyOccurrenceTypeClientChannels.templateKey,
    })
    .from(companyOccurrenceTypeClientChannels)
    .where(
      and(
        eq(companyOccurrenceTypeClientChannels.companyId, params.companyId),
        inArray(companyOccurrenceTypeClientChannels.occurrenceTypeId, [
          ...params.occurrenceTypeIds,
        ]),
      ),
    )
  const byType = new Map<string, StoredMatrix>()
  for (const { channel, occurrenceTypeId, ...setting } of rows) {
    byType.set(occurrenceTypeId, { ...byType.get(occurrenceTypeId), [channel]: setting })
  }
  return byType
}

function toLegacyFields(record: ClientChannelLegacyRecord) {
  return {
    clientChannel: record.clientChannel ?? CLIENT_CHANNEL_DEFAULT,
    clientEmailSendMode: record.clientEmailSendMode ?? CLIENT_EMAIL_SEND_MODE_DEFAULT,
    clientEmailType: record.clientEmailType ?? CLIENT_EMAIL_TYPE_DEFAULT,
  }
}

/** A matriz resolvida de cada tipo (o gravado, ou o derivado), numa consulta para a lista inteira. */
export async function readResolvedClientChannelMatrices(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly records: readonly ClientChannelLegacyRecord[] },
): Promise<ReadonlyMap<string, OccurrenceClientChannelMatrix>> {
  const stored = await readOccurrenceTypeClientChannels(queryable, {
    companyId: params.companyId,
    occurrenceTypeIds: params.records.map((record) => record.id),
  })
  return new Map(
    params.records.map((record) => [
      record.id,
      resolveClientChannelMatrix({ legacy: toLegacyFields(record), stored: stored.get(record.id) }),
    ]),
  )
}

/** Grava a matriz inteira (um upsert por canal), na transação do chamador. */
export async function writeOccurrenceTypeClientChannels(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly matrix: OccurrenceClientChannelMatrix
    readonly occurrenceTypeId: string
  },
): Promise<void> {
  await queryable
    .insert(companyOccurrenceTypeClientChannels)
    .values(
      OCCURRENCE_CLIENT_CHANNEL_ORDER.map((channel) => ({
        channel,
        companyId: params.companyId,
        enabled: params.matrix[channel].enabled,
        occurrenceTypeId: params.occurrenceTypeId,
        sendMode: params.matrix[channel].sendMode,
        templateKey: params.matrix[channel].templateKey,
      })),
    )
    .onConflictDoUpdate({
      set: {
        enabled: sql`excluded.enabled`,
        sendMode: sql`excluded.send_mode`,
        templateKey: sql`excluded.template_key`,
        updatedAt: sql`now()`,
      },
      target: [
        companyOccurrenceTypeClientChannels.companyId,
        companyOccurrenceTypeClientChannels.occurrenceTypeId,
        companyOccurrenceTypeClientChannels.channel,
      ],
    })
}

type ChannelTemplateRow = { readonly body: string; readonly subject: null | string }

/**
 * A versão ativa mais alta da chave **no canal**, `pt-BR`, da empresa — a mesma identidade do módulo que a 271 lê
 * (SQL parametrizado: a tabela do pacote não compõe com o nosso drizzle). Chave de outra empresa é `null`.
 */
export async function findActiveClientChannelTemplate(
  queryable: TripQueryable,
  params: {
    readonly channel: OccurrenceClientChannel
    readonly companyId: string
    readonly key: string
  },
): Promise<ClientChannelTemplateContent | null> {
  const [row] = await queryable.execute<ChannelTemplateRow>(sql`
    select t.subject, t.body
    from ${sql.identifier(NOTIFICATION_SCHEMA)}.templates as t
    where t.company_id = ${params.companyId}::uuid
      and t.key = ${params.key}
      and t.channel = ${params.channel}
      and t.locale = ${NOTIFICATION_DEFAULT_LOCALE}
      and t.active
    order by t.version desc
    limit 1`)
  return row === undefined ? null : { body: row.body, subject: row.subject }
}
