/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: as rotas da prévia montadas num lugar só, para o `main.ts` só espalhá-las. O
 * arquivo vai ao bucket privado da instalação, o mesmo das notas.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { defineRoute } from '../http/router.service.js'
import {
  createCargoPreviewItemActionUseCase,
  createProposeCargoPreviewArrivalUseCase,
} from './application/cargo-preview-action.use-case.js'
import type { CargoPreviewObjectStoragePort } from './application/cargo-preview.port.js'
import {
  createGetCargoPreviewUseCase,
  createListCargoPreviewsUseCase,
} from './application/read-cargo-preview.use-case.js'
import { createUploadCargoPreviewUseCase } from './application/upload-cargo-preview.use-case.js'
import { DrizzleCargoPreviewActionRepository } from './infrastructure/drizzle-cargo-preview-action.repository.js'
import { DrizzleCargoPreviewReadRepository } from './infrastructure/drizzle-cargo-preview-read.repository.js'
import { DrizzleCargoPreviewUploadRepository } from './infrastructure/drizzle-cargo-preview-upload.repository.js'
import { createCargoPreviewActionRoutes } from './presentation/cargo-preview-action.routes.js'
import { createCargoPreviewRoutes } from './presentation/cargo-preview.routes.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createCargoPreviewHttpRoutes(input: {
  readonly bucket: string
  readonly database: Database
  readonly now?: () => Date
  readonly storage: CargoPreviewObjectStoragePort
}): readonly ReturnType<typeof defineRoute>[] {
  const now = input.now ?? (() => new Date())
  const readRepository = new DrizzleCargoPreviewReadRepository(input.database)
  const actions = { now, repository: new DrizzleCargoPreviewActionRepository(input.database) }
  return [
    ...createCargoPreviewRoutes({
      getPreview: createGetCargoPreviewUseCase({ readRepository }),
      listPreviews: createListCargoPreviewsUseCase({ readRepository }),
      uploadPreview: createUploadCargoPreviewUseCase({
        bucket: input.bucket,
        now,
        readRepository,
        storage: input.storage,
        uploadRepository: new DrizzleCargoPreviewUploadRepository(input.database),
      }),
    }),
    ...createCargoPreviewActionRoutes({
      itemAction: createCargoPreviewItemActionUseCase(actions),
      proposeArrival: createProposeCargoPreviewArrivalUseCase(actions),
    }),
  ]
}
