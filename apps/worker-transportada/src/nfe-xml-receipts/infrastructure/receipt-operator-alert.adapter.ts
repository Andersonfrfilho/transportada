/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: falha definitiva de um recibo avisa quem opera a empresa (administradores e fiscal) pelo módulo de
 * notificações — sino e e-mail —, além do log de erro. Sem remetente nem arquivo no aviso: só canal e código.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { buildNfeXmlReceiptFailureNotification } from '../../notification/domain/notification-trigger.policy.js'
import type { NotificationTriggerInput } from '../../notification/domain/notification-trigger.policy.js'
import type { ReceiptOperatorAlertPort } from '../application/nfe-xml-receipt.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const OPERATOR_ROLES = sql`('company-admin', 'fiscal')`
const MAX_OPERATORS = 20

export function createReceiptOperatorAlertAdapter(dependencies: {
  readonly database: Database
  readonly send: (input: NotificationTriggerInput) => Promise<unknown>
}): ReceiptOperatorAlertPort {
  return {
    async notifyFailure(input) {
      const rows = (await dependencies.database.execute(sql`
        select distinct m.user_id
        from user_company_memberships m
        join membership_roles mr on mr.membership_id = m.id
        where m.company_id = ${input.companyId}::uuid and m.status = 'active'
          and mr.role in ${OPERATOR_ROLES}
        limit ${MAX_OPERATORS}
      `)) as unknown as readonly { user_id: string }[]
      for (const row of rows) {
        await dependencies.send(
          buildNfeXmlReceiptFailureNotification({
            channel: input.channel,
            companyId: input.companyId,
            errorCode: input.errorCode,
            receiptId: input.receiptId,
            recipientUserId: row.user_id,
          }),
        )
      }
    },
  }
}
