/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { CnhPictureBackfillSourcePort } from '../application/cnh-picture-backfill.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type PendingRow = {
  readonly attachment_id: string
  readonly bucket: string
  readonly company_id: string
  readonly object_key: string
}

/**
 * Pendente = sem foto, ou foto da CNH ainda não publicada no provedor (e o usuário já tem conta lá): o mesmo
 * passe refaz a publicação.
 * Tabelas que a API cria e o worker não modela (`fleet_drivers`, `stored_objects`, `identity_user_pictures`, `external_identities`):
 * SQL direto, com a paridade de nomes cobrada em `test/cnh-face/backfill.contract.ts`.
 */
export function createDrizzleCnhPictureBackfillRepository(
  database: Database,
): CnhPictureBackfillSourcePort {
  return {
    async listPending({ afterAttachmentId, limit }) {
      const rows = (await database.execute(
        sql`select attachment.id as attachment_id, attachment.company_id, object.bucket, object.object_key
            from fleet_driver_attachments attachment
            join fleet_drivers driver
              on driver.company_id = attachment.company_id and driver.id = attachment.driver_id
            join user_company_memberships membership
              on membership.company_id = driver.company_id and membership.id = driver.membership_id
            join stored_objects object
              on object.company_id = attachment.company_id and object.id = attachment.stored_object_id
            where attachment.type = 'cnh'
              and object.status = 'final'
              and (
                not exists (
                  select 1 from identity_user_pictures picture where picture.user_id = membership.user_id
                )
                or exists (
                  select 1 from identity_user_pictures picture
                  join external_identities identity on identity.user_id = picture.user_id
                  where picture.user_id = membership.user_id
                    and picture.origin = 'cnh'
                    and picture.published_at is null
                )
              )
              and (${afterAttachmentId ?? null}::uuid is null or attachment.id > ${afterAttachmentId ?? null}::uuid)
            order by attachment.id
            limit ${limit}`,
      )) as unknown as readonly PendingRow[]

      return rows.map((row) => ({
        attachmentId: row.attachment_id,
        bucket: row.bucket,
        companyId: row.company_id,
        objectKey: row.object_key,
      }))
    },
  }
}
