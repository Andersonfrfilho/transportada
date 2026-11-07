/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { whatsappFlowGraphVersions } from '../../database/database.schema.js'
import type {
  WhatsAppFlowGraphHistoryPort,
  WhatsAppFlowGraphHistorySnapshot,
} from '../application/whatsapp-flow-graph-publisher.port.js'

type WhatsAppFlowGraphHistoryDatabase = ReturnType<typeof createDrizzleProvider>['db']

/** O baseline mora na mesma tabela sob outra chave de fluxo, para não colidir com a versão do grafo vivo. */
const CODE_BASELINE_FLOW_KEY_SUFFIX = '#code-baseline'
const CODE_BASELINE_PUBLISHED_BY = 'code'

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
    async readCodeBaseline(companyId: string, flowKey: string) {
      const [row] = await db
        .select()
        .from(whatsappFlowGraphVersions)
        .where(
          and(
            eq(whatsappFlowGraphVersions.companyId, companyId),
            eq(whatsappFlowGraphVersions.flowKey, `${flowKey}${CODE_BASELINE_FLOW_KEY_SUFFIX}`),
          ),
        )
        .orderBy(desc(whatsappFlowGraphVersions.version))
        .limit(1)
      if (row === undefined) return undefined
      return {
        key: flowKey,
        label: row.label,
        nodes: row.nodes as FlowGraphData['nodes'],
        startNodeId: row.startNodeId,
        version: row.version,
      }
    },
    async recordCodeBaseline({ companyId, graph }: { companyId: string; graph: FlowGraphData }) {
      await db.insert(whatsappFlowGraphVersions).values({
        companyId,
        flowKey: `${graph.key}${CODE_BASELINE_FLOW_KEY_SUFFIX}`,
        label: graph.label,
        nodes: graph.nodes,
        publishedBy: CODE_BASELINE_PUBLISHED_BY,
        source: 'code',
        startNodeId: graph.startNodeId,
        version: graph.version,
      })
    },
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
