/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: as rotas da avaria sem viagem e da marcação montadas num lugar só, para o `main.ts`
 * só espalhá-las. A foto vai ao bucket privado da instalação, pelo mesmo armazenamento e pela mesma
 * URL assinada da ocorrência de galpão (spec 161). O canal é o da tela (ADR-0068 §3).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { defineRoute } from '../http/router.service.js'
import { CARGO_ARRIVAL_CHANNEL } from '../shared/cargo-arrival.constant.js'
import type { NfeStorageGateway } from '../storage/infrastructure/nfe-storage-gateway.js'
import { createDeliveryProofDownloadGateway } from '../trips/infrastructure/delivery-proof-download.gateway.js'
import { createDeliveryProofStorage } from '../trips/infrastructure/delivery-proof-storage.gateway.js'
import { DrizzleOccurrenceAttachmentRepository } from '../trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import { createChangeCargoArrivalReturnUseCase } from './application/cargo-arrival-return.use-case.js'
import {
  createListCargoArrivalOccurrencesUseCase,
  createListReceivingOccurrenceTypesUseCase,
} from './application/read-cargo-arrival-occurrences.use-case.js'
import { createRegisterCargoArrivalOccurrenceUseCase } from './application/register-cargo-arrival-occurrence.use-case.js'
import { DrizzleCargoArrivalOccurrenceReadRepository } from './infrastructure/drizzle-cargo-arrival-occurrence-read.repository.js'
import { DrizzleCargoArrivalOccurrenceUnitOfWork } from './infrastructure/drizzle-cargo-arrival-occurrence.repository.js'
import { DrizzleCargoArrivalReturnUnitOfWork } from './infrastructure/drizzle-cargo-arrival-return.repository.js'
import { createCargoArrivalOccurrenceRoutes } from './presentation/cargo-arrival-occurrence.routes.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createCargoArrivalOccurrenceHttpRoutes(input: {
  readonly bucket: string
  readonly database: Database
  readonly now?: () => Date
  readonly storage: NfeStorageGateway
}): readonly ReturnType<typeof defineRoute>[] {
  const now = input.now ?? (() => new Date())
  const channel = CARGO_ARRIVAL_CHANNEL.backoffice
  const reads = new DrizzleCargoArrivalOccurrenceReadRepository({
    attachments: new DrizzleOccurrenceAttachmentRepository(input.database),
    database: input.database,
    downloads: createDeliveryProofDownloadGateway({ storage: input.storage }),
  })
  return createCargoArrivalOccurrenceRoutes({
    changeReturn: createChangeCargoArrivalReturnUseCase({
      channel,
      now,
      unitOfWork: new DrizzleCargoArrivalReturnUnitOfWork(input.database),
    }),
    listOccurrences: createListCargoArrivalOccurrencesUseCase({ reads }),
    listTypes: createListReceivingOccurrenceTypesUseCase({ reads }),
    registerOccurrence: createRegisterCargoArrivalOccurrenceUseCase({
      channel,
      newObjectId: () => crypto.randomUUID(),
      now,
      reads,
      storage: createDeliveryProofStorage({ bucket: input.bucket, storage: input.storage }),
      unitOfWork: new DrizzleCargoArrivalOccurrenceUnitOfWork(input.database, input.bucket),
    }),
  })
}
