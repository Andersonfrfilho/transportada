/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { whatsappFlowGraphVersions } from '../../database/database.schema.js'
import type {
  WhatsAppFlowGraphHistoryPort,
  WhatsAppFlowGraphHistorySnapshot,
} from '../application/whatsapp-flow-graph-publisher.port.js'

type WhatsAppFlowGraphHistoryDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * `insert` só — a tabela é append-only pelo trigger da migration, e nenhum método deste repositório
 * tenta `update`/`delete`. Construído com `database.db` para leitura fora de transação, e com o
 * `tx` de uma transação Drizzle quando o publicador precisa gravar o histórico e a linha viva do
 * módulo atomicamente (`publish-whatsapp-flow-graph.use-case.ts`).
 */
export function createDrizzleWhatsAppFlowGraphHistoryRepository(
  db: WhatsAppFlowGraphHistoryDatabase,
): WhatsAppFlowGraphHistoryPort {
  return {
    async record({ companyId, graph, publishedBy, source }: WhatsAppFlowGraphHistorySnapshot) {
      await db.insert(whatsappFlowGraphVersions).values({
        companyId,
        flowKey: graph.key,
        label: graph.label,
        nodes: graph.nodes,
        publishedBy,
        source,
        startNodeId: graph.startNodeId,
        version: graph.version,
      })
    },
  }
}
