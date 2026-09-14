/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { FlowGraphRepository } from '@adatechnology/meta-whatsapp-module'

import {
  createPublishWhatsAppFlowGraphUseCase,
  type PublishWhatsAppFlowGraph,
} from '../application/publish-whatsapp-flow-graph.use-case.js'
import type { WhatsAppFlowGraphPublisherRepositories } from '../application/whatsapp-flow-graph-publisher.port.js'
import { createDrizzleWhatsAppFlowGraphHistoryRepository } from './drizzle-whatsapp-flow-graph-history.repository.js'

type WhatsAppFlowGraphPublisherDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * A trava otimista (`OptimisticLockError`) só vale a pena se a linha viva do módulo e a linha do
 * nosso histórico gravarem **na mesma transação**: `FlowGraphRepository` e o repositório de
 * histórico nascem de novo aqui, atados ao `tx` da transação Drizzle — não à conexão de fora dela —
 * porque as duas classes usam a conexão que receberam na construção, nunca a que alguém passa
 * depois. Fora disso, "grave o histórico antes do save" seria duas escritas com uma janela entre
 * elas, e conflito de versão a meio caminho deixaria histórico sem a linha viva correspondente.
 */
export function createDrizzleWhatsAppFlowGraphPublisher(
  db: WhatsAppFlowGraphPublisherDatabase,
): PublishWhatsAppFlowGraph {
  return createPublishWhatsAppFlowGraphUseCase({
    runInTransaction: (work) =>
      db.transaction(async (tx) => {
        const repositories: WhatsAppFlowGraphPublisherRepositories = {
          history: createDrizzleWhatsAppFlowGraphHistoryRepository(tx as never),
          module: new FlowGraphRepository(tx as never),
        }
        return work(repositories)
      }),
  })
}
