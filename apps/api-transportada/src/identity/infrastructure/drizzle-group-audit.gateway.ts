/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { auditLogs } from '../../database/database.schema'
import type { GroupAuditPort } from '../application/company-group.audit.port.js'

type IdentityDatabase = ReturnType<typeof createDrizzleProvider>['db']

const GROUP_ENTITY = 'company-group'
const GROUP_PERMISSION = 'groups.manage'

/**
 * Uma linha por alvo, não uma por clique: `groups.manage` concede permissão e quem a tem pode se
 * auto-promover — decisão registrada. O que se pergunta depois é "quem deu o quê a quem", e um
 * contador agregado não responde isso.
 *
 * Sem alvo não há linha. Registrar uma operação que não alcançou ninguém encheria a trilha de ruído
 * exatamente onde ela precisa ser lida com atenção.
 */
export function createDrizzleGroupAudit(database: IdentityDatabase): GroupAuditPort {
  return {
    async record({ action, actorUserId, companyId, correlationId, metadata, targetIds }) {
      if (targetIds.length === 0) return

      await database.insert(auditLogs).values(
        targetIds.map((targetId) => ({
          action,
          actorUserId,
          companyId,
          correlationId,
          entityId: targetId,
          entityType: GROUP_ENTITY,
          ...(metadata === undefined ? {} : { metadata }),
          permission: GROUP_PERMISSION,
          targetId,
          targetType: GROUP_ENTITY,
        })),
      )
    },
  }
}
