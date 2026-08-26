/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createModuleFetchRouter, type ModuleFetchRouter } from '@adatechnology/module-http/fetch'
import { createUserRoutes, type UserModule } from '@adatechnology/user-module'

import { createUserAuthResolver } from './user-auth.resolver.js'

export const USER_ROUTES_BASE_PATH = '/user'

type CreateUserHttpRouterParams = {
  readonly companyId: string
  readonly module: UserModule
}

export function createUserHttpRouter({
  companyId,
  module,
}: CreateUserHttpRouterParams): ModuleFetchRouter {
  return createModuleFetchRouter({
    authResolver: createUserAuthResolver({ companyId, module }),
    basePath: USER_ROUTES_BASE_PATH,
    routes: createUserRoutes({ module }),
  })
}
