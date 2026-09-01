/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import {
  externalIdentities,
  identityUserProfiles,
  userCompanyMemberships,
} from '../../database/identity.schema.js'
import type { LocalDocumentSource } from '../application/identity-document.port.js'

export type LocalDocumentDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleLocalDocumentSource(
  database: LocalDocumentDatabase,
): LocalDocumentSource {
  return {
    async findBySubjects({ subjects }) {
      if (subjects.length === 0) return []

      /**
       * O `company_id` vem do vínculo ativo porque ele viaja junto do documento na escrita: o Admin
       * API substitui o conjunto de atributos, e escrever só o documento apagaria a empresa.
       * Vínculo inativo fica de fora — quem não pertence mais à empresa não tem empresa a gravar.
       */
      const rows = await database
        .select({
          companyId: userCompanyMemberships.companyId,
          subject: externalIdentities.subject,
          taxId: identityUserProfiles.taxId,
        })
        .from(externalIdentities)
        .innerJoin(identityUserProfiles, eq(identityUserProfiles.userId, externalIdentities.userId))
        .innerJoin(
          userCompanyMemberships,
          and(
            eq(userCompanyMemberships.userId, externalIdentities.userId),
            eq(userCompanyMemberships.status, 'active'),
          ),
        )
        .where(inArray(externalIdentities.subject, [...subjects]))

      return rows
    },
  }
}
