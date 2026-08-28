/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

export const WHATSAPP_CHANNEL_STATUSES = ['active', 'disabled'] as const
export type WhatsAppChannelStatus = (typeof WHATSAPP_CHANNEL_STATUSES)[number]

/**
 * O `phone_number_id` da Cloud API é o identificador do número na Meta, não o número em si — dígitos,
 * e é ele que a Graph API recebe na URL. O `waba_id` é a conta de negócio que o contém.
 */
const META_ID_PATTERN = '^[0-9]{5,32}$'
/** E.164 sem o `+`, como a Meta devolve: só dígitos, do código do país ao número. */
const DISPLAY_NUMBER_PATTERN = '^[0-9]{10,15}$'

/**
 * Spec 062 T001: **a credencial do WhatsApp, por empresa.**
 *
 * Por empresa e não global porque a operação tem um número por filial (decisão de 2026-08-28) — e
 * neste produto **cada CNPJ já é uma `companies`**, então "por filial" é "por empresa" sem entidade
 * nova e sem esperar a spec 054. ⚠️ Se um dia a 054 criar sub-filial **dentro** de uma empresa, esta
 * chave precisa ser revisitada.
 *
 * O token de acesso **nunca** é persistido em claro: ele vai selado no envelope `A256GCM`, com AAD
 * `transportada:whatsapp-channel:v1:${companyId}:${channelId}` — o mesmo desenho da credencial da
 * Nota RP (ADR-0035). Um envelope amarrado à linha não se aproveita em outra empresa nem em outro
 * canal, mesmo com o banco inteiro na mão.
 */
export const whatsappChannels = pgTable(
  'whatsapp_channels',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    /** O que a Graph API recebe na URL do envio. */
    phoneNumberId: text('phone_number_id').notNull(),
    wabaId: text('waba_id').notNull(),
    /**
     * O número como a pessoa o lê. Ele existe **só para a tela**: quem envia é o `phone_number_id`, e
     * guardar o número por perto evita o operador ter de decorar qual id é qual linha.
     */
    displayPhoneNumber: text('display_phone_number').notNull().default(''),
    secretEnvelope: jsonb('secret_envelope').notNull(),
    status: text().$type<WhatsAppChannelStatus>().notNull().default('active'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_channels_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * Um canal por empresa. Dois números na mesma empresa fariam a notificação escolher — e escolher
     * de que número o cliente recebe é decisão de operação, não sorteio de `order by`.
     */
    unique('whatsapp_channels_company_id_unique').on(table.companyId),
    unique('whatsapp_channels_company_id_id_unique').on(table.companyId, table.id),
    /**
     * O mesmo número em duas empresas é erro de cadastro que só apareceria na primeira resposta do
     * cliente, na conversa errada.
     */
    unique('whatsapp_channels_phone_number_id_unique').on(table.phoneNumberId),
    check(
      'whatsapp_channels_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_CHANNEL_STATUSES))})`,
    ),
    check(
      'whatsapp_channels_phone_number_id_check',
      sql`${table.phoneNumberId} ~ ${sql.raw(`'${META_ID_PATTERN}'`)}`,
    ),
    check(
      'whatsapp_channels_waba_id_check',
      sql`${table.wabaId} ~ ${sql.raw(`'${META_ID_PATTERN}'`)}`,
    ),
    /** Vazio é o padrão — o número de exibição é conveniência, não requisito de envio. */
    check(
      'whatsapp_channels_display_number_check',
      sql`${table.displayPhoneNumber} = '' or ${table.displayPhoneNumber} ~ ${sql.raw(`'${DISPLAY_NUMBER_PATTERN}'`)}`,
    ),
    check('whatsapp_channels_version_check', sql`${table.version} >= 1`),
  ],
)
