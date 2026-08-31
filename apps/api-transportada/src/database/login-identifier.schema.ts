/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { identityUsers } from './identity.schema.js'

/** Por onde a pessoa pode se identificar. Documento e telefone o Keycloak não sabe procurar. */
export const LOGIN_IDENTIFIER_KINDS = ['email', 'document', 'phone'] as const
export type LoginIdentifierKind = (typeof LOGIN_IDENTIFIER_KINDS)[number]

/** Projeção da ficha, ou acréscimo de quem administra. A reconstrução só apaga o primeiro. */
export const LOGIN_IDENTIFIER_SOURCES = ['profile', 'manual'] as const
export type LoginIdentifierSource = (typeof LOGIN_IDENTIFIER_SOURCES)[number]

/**
 * O provedor encontra alguém por `username` ou pelo campo `email` — um só, único no realm. Nem
 * documento nem telefone entram nessa busca, e nenhum atributo entra. Esta tabela é o que permite a
 * pessoa digitar o que ela lembra: nós resolvemos quem é e mandamos ao provedor o login que ele
 * conhece.
 *
 * ⚠️ **O valor não é único de propósito.** Telefone é compartilhado no mundo real — o agregado que
 * usa o número da empresa, a dupla de motoristas com um aparelho só. Um `unique` faria o segundo
 * cadastro falhar, ou o primeiro roubar o atalho do outro em silêncio. Aqui o valor repetido é
 * permitido, e a **resolução** é que recusa: só devolve login quando há exatamente uma pessoa.
 */
export const loginIdentifiers = pgTable(
  'login_identifiers',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    kind: text().$type<LoginIdentifierKind>().notNull(),
    /** Guardado já normalizado: a busca é por igualdade, e máscara e caixa não são identidade. */
    value: text().notNull(),
    /**
     * De onde a linha veio. `profile` é projeção da ficha e é reescrita a cada gravação dela;
     * `manual` é o que alguém acrescentou na tela, e a reconstrução não encosta.
     */
    source: text().$type<LoginIdentifierSource>().notNull().default('profile'),
    /** O telefone que recebe mensagem por WhatsApp. Registro hoje; escolha de canal quando houver. */
    isWhatsapp: boolean('is_whatsapp').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [identityUsers.id],
      name: 'login_identifiers_user_id_identity_users_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    /** A mesma pessoa não cadastra o mesmo valor duas vezes; pessoas diferentes podem. */
    unique('login_identifiers_user_kind_value_unique').on(table.userId, table.kind, table.value),
    index('login_identifiers_kind_value_idx').on(table.kind, table.value),
    check('login_identifiers_kind_check', sql`${table.kind} in ('email', 'document', 'phone')`),
    check('login_identifiers_value_not_blank_check', sql`length(btrim(${table.value})) > 0`),
    check(
      'login_identifiers_value_normalized_check',
      sql`${table.value} = lower(btrim(${table.value}))`,
    ),
    check('login_identifiers_source_check', sql`${table.source} in ('profile', 'manual')`),
    /** Só telefone recebe WhatsApp: a marca num e-mail ou num documento não quer dizer nada. */
    check(
      'login_identifiers_whatsapp_kind_check',
      sql`${table.isWhatsapp} = false or ${table.kind} = 'phone'`,
    ),
  ],
)
