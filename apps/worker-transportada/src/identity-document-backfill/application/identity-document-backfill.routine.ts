/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  IDENTITY_BACKFILL_MAX_PAGES,
  IDENTITY_BACKFILL_PAGE_SIZE,
  IDENTITY_COMPANY_ID_ATTRIBUTE,
  IDENTITY_TAX_ID_ATTRIBUTE,
} from '../domain/identity-document-backfill.constant.js'
import type { IdentityRealmPort, LocalDocumentSource, RealmUser } from './identity-document.port.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'
const PROVIDER_UNREACHABLE_OUTCOME: JobOutcome = 'identity_provider_unreachable'

export type IdentityDocumentBackfillDependencies = {
  readonly documents: LocalDocumentSource
  readonly logger: WorkerLogger
  readonly realm: IdentityRealmPort
}

/**
 * O documento passou a ser escrito no realm agora; quem foi convidado antes está lá sem ele, e
 * nenhum convite futuro alcança essa gente. Esta é a passada que alcança — e ela converge: quando
 * todo mundo tiver o atributo, o ciclo não acha nada e fecha em zero.
 */
export function createIdentityDocumentBackfillRoutine(
  dependencies: IdentityDocumentBackfillDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: IdentityDocumentBackfillDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  let examined = 0
  let written = 0
  let pages = 0

  while (pages < IDENTITY_BACKFILL_MAX_PAGES && !context.isStopRequested()) {
    let page
    try {
      page = await dependencies.realm.listUsers({
        first: pages * IDENTITY_BACKFILL_PAGE_SIZE,
        limit: IDENTITY_BACKFILL_PAGE_SIZE,
      })
    } catch {
      /**
       * O provedor fora do ar é a única falha com nome próprio aqui. Ela domina o ciclo: uma passada
       * que escreveu metade e diz "concluído" faria a próxima janela pular quem ficou de fora.
       */
      return {
        counters: { examined, pages, written },
        outcome: PROVIDER_UNREACHABLE_OUTCOME,
      }
    }

    pages += 1
    examined += page.users.length
    const pending = page.users.filter(hasNoDocument)

    if (pending.length > 0) {
      const documents = await dependencies.documents.findBySubjects({
        subjects: pending.map((user) => user.subject),
      })

      for (const document of documents) {
        if (context.isStopRequested()) break
        if (document.taxId === '') continue
        try {
          /**
           * O Admin API substitui o conjunto inteiro: sem o `company_id` junto, o backfill apagaria
           * a empresa do usuário e o login seguinte entraria sem ela.
           */
          await dependencies.realm.updateAttributes({
            attributes: {
              [IDENTITY_COMPANY_ID_ATTRIBUTE]: document.companyId,
              [IDENTITY_TAX_ID_ATTRIBUTE]: document.taxId,
            },
            userId: document.subject,
          })
          written += 1
        } catch {
          return { counters: { examined, pages, written }, outcome: PROVIDER_UNREACHABLE_OUTCOME }
        }
      }
    }

    if (!page.hasMore) break
  }

  /** Contagem, nunca documento: um backfill de PII que escreve a PII no log entregou o que protegia. */
  safeLogInfo({
    logger: dependencies.logger,
    message: 'identity_document_backfill_cycle_finished',
    metadata: {
      correlationId: context.correlationId,
      examined,
      executionId: context.executionId,
      exhausted: pages >= IDENTITY_BACKFILL_MAX_PAGES,
      pages,
      written,
    },
  })

  return { counters: { examined, pages, written }, outcome: COMPLETED_OUTCOME }
}

/** Atributo ausente e atributo vazio são a mesma coisa: ninguém escreveu o documento ali. */
function hasNoDocument(user: RealmUser): boolean {
  const value = user.attributes[IDENTITY_TAX_ID_ATTRIBUTE]
  if (value === undefined) return true
  const first = Array.isArray(value) ? (value.at(0) ?? '') : String(value)
  return first.trim() === ''
}
