/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createModuleFetchRouter, type ModuleFetchRouter } from '@adatechnology/module-http/fetch'
import type { UserModule } from '@adatechnology/user-module'

import type { AggregateDocumentUseCase } from '../../fleet/application/aggregate-document.use-case.js'
import type { AggregatePortalRepositoryPort } from '../../fleet/application/aggregate-portal.port.js'
import type { AggregatePortalUseCase } from '../../fleet/application/aggregate-portal.use-case.js'
import { createUserAuthResolver } from './user-auth.resolver.js'
import { createAggregatePortalRoutes } from './aggregate-portal.routes.js'

export const AGGREGATE_PORTAL_ROUTES_BASE_PATH = '/aggregate-portal'

type CreateAggregatePortalHttpRouterParams = {
  readonly accountRepository: Pick<AggregatePortalRepositoryPort, 'findAccountByUserId'>
  readonly aggregateDocuments: AggregateDocumentUseCase
  readonly aggregatePortal: AggregatePortalUseCase
  readonly companyId: string
  readonly module: UserModule
}

/**
 * Router próprio, não rota anexada ao `/user` — o token que autentica é o mesmo (`user-module`),
 * mas o dado servido é nosso (`fleet_drivers`/`aggregate_applications`/`aggregate_documents`), não
 * do SDK.
 */
export function createAggregatePortalHttpRouter({
  accountRepository,
  aggregateDocuments,
  aggregatePortal,
  companyId,
  module,
}: CreateAggregatePortalHttpRouterParams): ModuleFetchRouter {
  return createModuleFetchRouter({
    authResolver: createUserAuthResolver({ companyId, module }),
    basePath: AGGREGATE_PORTAL_ROUTES_BASE_PATH,
    routes: createAggregatePortalRoutes({ accountRepository, aggregateDocuments, aggregatePortal }),
  })
}
