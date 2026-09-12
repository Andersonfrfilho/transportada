/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import type { WhatsAppFlowGraphProviderPort } from './whatsapp-command-driver.port.js'
import type { WhatsAppFlowGraphModulePort } from './whatsapp-flow-graph-publisher.port.js'

/**
 * Grafos em código, iguais para toda empresa — só usado nos testes do despachante que não montam o
 * publicador (T006/T007). Em produção o T008 usa `createModuleWhatsAppFlowGraphProvider`.
 */
export function createStaticWhatsAppFlowGraphProvider(input: {
  readonly graphs: readonly FlowGraphData[]
  readonly rootFlowKey: string
}): WhatsAppFlowGraphProviderPort {
  const graphsByKey = new Map(input.graphs.map((graph) => [graph.key, graph]))

  return {
    findGraph: async ({ flowKey }) => graphsByKey.get(flowKey),
    rootFlowKey: input.rootFlowKey,
  }
}

/**
 * Spec 144 T008 — lê a versão **publicada** direto da `FlowGraphRepository` do módulo (a mesma
 * linha que `create`/`save` escrevem), companhia por companhia. É o que faz o comando de
 * republicação valer sem restart: o próximo `onMessageReceived` já lê o grafo novo.
 */
export function createModuleWhatsAppFlowGraphProvider(input: {
  readonly repository: Pick<WhatsAppFlowGraphModulePort, 'get'>
  readonly rootFlowKey: string
}): WhatsAppFlowGraphProviderPort {
  return {
    findGraph: async ({ companyId, flowKey }) => input.repository.get(companyId, flowKey),
    rootFlowKey: input.rootFlowKey,
  }
}
