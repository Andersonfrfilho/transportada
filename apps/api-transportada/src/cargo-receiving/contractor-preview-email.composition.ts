/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b: as quatro rotas da entrada da prévia por e-mail montadas num lugar só, para o `main.ts` só
 * espalhá-las.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { ClientIpResolver } from '../http/client-ip.service.js'
import type { defineRoute } from '../http/router.service.js'
import { createContractorPreviewEmailUseCases } from './application/contractor-preview-email.use-case.js'
import { DrizzleContractorPreviewEmailRepository } from './infrastructure/drizzle-contractor-preview-email.repository.js'
import { createContractorPreviewEmailRoutes } from './presentation/contractor-preview-email.routes.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createContractorPreviewEmailHttpRoutes(input: {
  readonly database: Database
  readonly resolveClientIp: ClientIpResolver
}): readonly ReturnType<typeof defineRoute>[] {
  const repository = new DrizzleContractorPreviewEmailRepository(input.database)
  return createContractorPreviewEmailRoutes({
    ...createContractorPreviewEmailUseCases({ repository }),
    resolveClientIp: input.resolveClientIp,
  })
}
