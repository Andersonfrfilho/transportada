/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { requireUser } from '@adatechnology/user-module'
import type { ModuleRouteTable } from '@adatechnology/module-http'

import { AGGREGATE_DOCUMENT_TYPES, type AggregateDocumentType } from '../../database/fleet.schema.js'
import type { AggregateDocumentUseCase } from '../../fleet/application/aggregate-document.use-case.js'
import type { AggregatePortalRepositoryPort } from '../../fleet/application/aggregate-portal.port.js'
import type { AggregatePortalUseCase } from '../../fleet/application/aggregate-portal.use-case.js'
import { AggregatePortalAccountNotLinkedError } from '../../fleet/domain/aggregate-portal.error.js'
import { AggregateDocumentInvalidUploadError } from '../../fleet/domain/aggregate-document.error.js'

type Dependencies = {
  readonly accountRepository: Pick<AggregatePortalRepositoryPort, 'findAccountByUserId'>
  readonly aggregateDocuments: AggregateDocumentUseCase
  readonly aggregatePortal: AggregatePortalUseCase
}

function isAggregateDocumentType(value: string): value is AggregateDocumentType {
  return (AGGREGATE_DOCUMENT_TYPES as readonly string[]).includes(value)
}

export function createAggregatePortalRoutes(dependencies: Dependencies): ModuleRouteTable {
  async function resolveAccount(userId: string) {
    const account = await dependencies.accountRepository.findAccountByUserId({ userId })
    if (account === null) throw new AggregatePortalAccountNotLinkedError()
    return account
  }

  return [
    {
      async handler(context) {
        const userId = requireUser(context)
        const profile = await dependencies.aggregatePortal.getProfile({ userId })
        return { body: { data: profile }, kind: 'json', status: 200 }
      },
      method: 'GET',
      operationId: 'getAggregatePortalProfile',
      path: '/me',
      scope: 'user',
      summary: 'Status da candidatura/ficha e dados da conta do agregado logado',
    },
    {
      async handler(context) {
        const userId = requireUser(context)
        const account = await resolveAccount(userId)
        const documents = await dependencies.aggregateDocuments.list(account)
        return { body: { data: documents }, kind: 'json', status: 200 }
      },
      method: 'GET',
      operationId: 'listAggregateDocuments',
      path: '/documents',
      scope: 'user',
      summary: 'Lista os tipos de documento exigidos e o status de cada um',
    },
    {
      async handler(context) {
        const userId = requireUser(context)
        const type = context.params.type
        if (type === undefined || !isAggregateDocumentType(type)) {
          throw new AggregateDocumentInvalidUploadError()
        }
        const account = await resolveAccount(userId)
        const bytes = context.rawBody
        if (bytes === undefined) throw new AggregateDocumentInvalidUploadError()

        const document = await dependencies.aggregateDocuments.upload({ ...account, bytes, type })
        return { body: { data: document }, kind: 'json', status: 201 }
      },
      method: 'POST',
      operationId: 'uploadAggregateDocument',
      path: '/documents/:type',
      scope: 'user',
      summary: 'Envia (ou reenvia) um documento — o status volta a pendente até a revisão',
    },
  ]
}
