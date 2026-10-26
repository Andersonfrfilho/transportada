/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T4b (RF8): o reconhecimento do e-mail na conversa montado sobre o trilho de envio da 248/T3. Um lugar só
 * para a fiação, usada pela resposta do motorista no app, pelo hook do WhatsApp e pelas rotas do cartão.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { ApiLogger } from '../../shared/api.types.js'
import {
  createDetectedClientEmailUseCase,
  type DetectedClientEmailUseCase,
} from '../application/detected-client-email.use-case.js'
import { createForwardContractorReplyByEmailUseCase } from '../application/forward-contractor-reply-by-email.use-case.js'
import { createDrizzleContractorReplyEmailUnitOfWork } from './drizzle-contractor-reply-email.repository.js'
import { createDrizzleDetectedClientEmailRepository } from './drizzle-detected-client-email.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDetectedClientEmail(
  database: Database,
  logger: ApiLogger,
): DetectedClientEmailUseCase {
  return createDetectedClientEmailUseCase({
    clock: () => new Date(),
    forwardByEmail: createForwardContractorReplyByEmailUseCase({
      logger,
      unitOfWork: createDrizzleContractorReplyEmailUnitOfWork(database),
    }),
    logger,
    store: createDrizzleDetectedClientEmailRepository(database),
  })
}
