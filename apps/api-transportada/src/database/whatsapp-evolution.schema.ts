/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

export const WHATSAPP_EVOLUTION_STATUSES = ['active', 'disabled'] as const
export type WhatsAppEvolutionStatus = (typeof WHATSAPP_EVOLUTION_STATUSES)[number]

/** Provedor padrão de WhatsApp da empresa (spec 281 RF2): a Meta oficial ou o Evolution. */
export const WHATSAPP_DEFAULT_PROVIDERS = ['meta', 'evolution'] as const
export type WhatsAppDefaultProvider = (typeof WHATSAPP_DEFAULT_PROVIDERS)[number]

/** Último estado que o Evolution disse; `unknown` até a primeira leitura. */
export const WHATSAPP_EVOLUTION_CONNECTION_STATES = [
  'open',
  'connecting',
  'close',
  'unknown',
] as const
export type WhatsAppEvolutionConnectionState = (typeof WHATSAPP_EVOLUTION_CONNECTION_STATES)[number]

/** Nome de instância do Evolution: vai na URL, então só caracteres que não precisam de escape. */
const INSTANCE_NAME_PATTERN = '^[A-Za-z0-9_-]{1,64}$'

export const WHATSAPP_EVOLUTION_DAILY_CAP_RANGE = { max: 1000, min: 1 } as const
export const WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE = { max: 3600, min: 1 } as const

/**
 * Spec 281 T4 (RF2): **a configuração do Evolution, por empresa.** Uma instância (um número) por
 * empresa (D3), ao lado — nunca no lugar — do `whatsapp_channels` da Meta.
 *
 * A chave da instância **nunca** é persistida em claro: vai no envelope `A256GCM` com AAD
 * `transportada:whatsapp-evolution:v1:${companyId}:${settingsId}`, o mesmo desenho do canal da Meta.
 * `connection_state` é só o último palpite para a tela e para o disjuntor; quem decide é o Evolution,
 * consultado na hora.
 */
export const whatsappEvolutionSettings = pgTable(
  'whatsapp_evolution_settings',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    baseUrl: text('base_url').notNull(),
    instanceName: text('instance_name').notNull(),
    secretEnvelope: jsonb('secret_envelope').notNull(),
    status: text().$type<WhatsAppEvolutionStatus>().notNull().default('disabled'),
    defaultProvider: text('default_provider')
      .$type<WhatsAppDefaultProvider>()
      .notNull()
      .default('meta'),
    dailyCap: integer('daily_cap').notNull().default(300),
    minIntervalSeconds: integer('min_interval_seconds').notNull().default(15),
    /** Spec 289: o próximo instante em que o número pode enviar; cada envio reserva uma vaga `min_interval_seconds` adiante da anterior. */
    nextSendAt: timestamp('next_send_at', { withTimezone: true }),
    connectionState: text('connection_state')
      .$type<WhatsAppEvolutionConnectionState>()
      .notNull()
      .default('unknown'),
    connectionCheckedAt: timestamp('connection_checked_at', { withTimezone: true }),
    /** RF7: o dono leu o aviso de risco (R1) antes de ligar. */
    riskAcknowledgedAt: timestamp('risk_acknowledged_at', { withTimezone: true }),
    riskAcknowledgedBy: uuid('risk_acknowledged_by'),
    /**
     * Spec 281 T6 (RF4): o segmento opaco de `POST /public/whatsapp-evolution/<webhookId>`. Só acha a
     * linha; quem prova que a entrega veio do Evolution é o segredo do cabeçalho.
     */
    webhookId: uuid('webhook_id').defaultRandom().notNull(),
    /** O segredo do cabeçalho do webhook, selado com AAD próprio; nulo até o primeiro registro. */
    webhookSecretEnvelope: jsonb('webhook_secret_envelope'),
    /** Quando o webhook foi apontado para nós; volta a nulo quando endereço, instância ou chave mudam. */
    webhookRegisteredAt: timestamp('webhook_registered_at', { withTimezone: true }),
    /** A última entrega autenticada: o operador vê se o recebimento está vivo. */
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_evolution_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('whatsapp_evolution_settings_company_id_unique').on(table.companyId),
    /** Alvo da URL anônima do webhook: colisão apontaria a mensagem de uma empresa para outra. */
    unique('whatsapp_evolution_settings_webhook_id_unique').on(table.webhookId),
    check(
      'whatsapp_evolution_settings_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_EVOLUTION_STATUSES))})`,
    ),
    check(
      'whatsapp_evolution_settings_default_provider_check',
      sql`${table.defaultProvider} in (${sql.raw(inList(WHATSAPP_DEFAULT_PROVIDERS))})`,
    ),
    check(
      'whatsapp_evolution_settings_connection_state_check',
      sql`${table.connectionState} in (${sql.raw(inList(WHATSAPP_EVOLUTION_CONNECTION_STATES))})`,
    ),
    check(
      'whatsapp_evolution_settings_instance_name_check',
      sql`${table.instanceName} ~ ${sql.raw(`'${INSTANCE_NAME_PATTERN}'`)}`,
    ),
    check(
      'whatsapp_evolution_settings_base_url_check',
      sql`${table.baseUrl} ~ '^https?://[^/?#[:space:]]+$' and length(${table.baseUrl}) <= 255`,
    ),
    check(
      'whatsapp_evolution_settings_daily_cap_check',
      sql`${table.dailyCap} between ${sql.raw(String(WHATSAPP_EVOLUTION_DAILY_CAP_RANGE.min))} and ${sql.raw(String(WHATSAPP_EVOLUTION_DAILY_CAP_RANGE.max))}`,
    ),
    check(
      'whatsapp_evolution_settings_min_interval_check',
      sql`${table.minIntervalSeconds} between ${sql.raw(String(WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE.min))} and ${sql.raw(String(WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE.max))}`,
    ),
    /** Ligar sem ter lido o aviso de risco (RF7) não existe, nem por SQL direto. */
    check(
      'whatsapp_evolution_settings_active_requires_risk_ack_check',
      sql`${table.status} = 'disabled' or ${table.riskAcknowledgedAt} is not null`,
    ),
    check('whatsapp_evolution_settings_version_check', sql`${table.version} >= 1`),
  ],
)
