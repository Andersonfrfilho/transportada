/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import type { FlowInterpreter } from '@adatechnology/meta-whatsapp-module'

/** O pedaço da linha de sessão que o despachante lê: posição no fluxo e contexto, nada de ator. */
export type WhatsAppSessionPosition = {
  readonly context: Record<string, unknown>
  readonly currentNodeId: string | null
  readonly currentState: string
  readonly flowKey: string | null
}

/**
 * O recorte do `SessionRepository` do pacote que o despachante usa. A forma posicional é a do
 * pacote; é ela que deixa passar o repositório real sem adaptador.
 */
export type WhatsAppCommandSessionPort = {
  getContext(
    companyId: string,
    whatsappNumber: string,
  ): Promise<WhatsAppSessionPosition | undefined>
  requestHuman(companyId: string, whatsappNumber: string): Promise<void>
  setFlowPosition(
    companyId: string,
    whatsappNumber: string,
    flowKey: string | null,
    currentNodeId: string | null,
  ): Promise<void>
  setState(
    companyId: string,
    whatsappNumber: string,
    state: string,
    context?: Record<string, unknown>,
  ): Promise<void>
}

export type WhatsAppChoiceOption = { readonly id: string; readonly title: string }

export type WhatsAppMessageSenderPort = {
  sendButtons(input: {
    readonly body: string
    readonly buttons: readonly WhatsAppChoiceOption[]
    readonly to: string
  }): Promise<void>
  sendList(input: {
    readonly body: string
    readonly buttonLabel: string
    readonly rows: readonly WhatsAppChoiceOption[]
    readonly to: string
  }): Promise<void>
  sendText(input: { readonly body: string; readonly to: string }): Promise<void>
}

export type WhatsAppFlowGraphProviderPort = {
  readonly rootFlowKey: string
  findGraph(input: {
    readonly companyId: string
    readonly flowKey: string
  }): Promise<FlowGraphData | undefined>
}

export type WhatsAppFlowInterpreterPort = Pick<FlowInterpreter, 'run'>
