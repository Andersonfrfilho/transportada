/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { identityUsers } from './identity.schema.js'

/**
 * WebP entra porque é o que o recorte de fundo devolve: o pacote de recorte comprime a saída, e
 * recusá-lo obrigaria a tela a reconverter a imagem para PNG, maior, só para caber numa lista.
 */
export const USER_PICTURE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type UserPictureMimeType = (typeof USER_PICTURE_MIME_TYPES)[number]

/** 256 KiB, o mesmo teto do logotipo: retrato de avatar não chega perto disso depois de comprimido. */
export const USER_PICTURE_MAX_BYTES = 262_144

const MIME_TYPE_LIST = sql.raw(USER_PICTURE_MIME_TYPES.map((type) => `'${type}'`).join(', '))

export const identityUserPictures = pgTable(
  'identity_user_pictures',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => identityUsers.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    mimeType: text('mime_type').$type<UserPictureMimeType>().notNull(),
    contentBase64: text('content_base64').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('identity_user_pictures_mime_type_check', sql`${table.mimeType} in (${MIME_TYPE_LIST})`),
    check(
      'identity_user_pictures_byte_size_check',
      sql`${table.byteSize} between 1 and ${sql.raw(String(USER_PICTURE_MAX_BYTES))}`,
    ),
    check('identity_user_pictures_sha256_check', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
)
