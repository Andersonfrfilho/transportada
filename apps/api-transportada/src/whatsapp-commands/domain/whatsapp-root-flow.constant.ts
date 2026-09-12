/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

export const WHATSAPP_ROOT_FLOW_KEY = 'whatsapp-root'

/**
 * O grafo mínimo que o despachante serve até a T008 publicar o seed versionado e filtrado por
 * permissão: um menu e uma saída que diz o que existe. Nenhuma opção aqui executa ação de negócio.
 */
export const WHATSAPP_ROOT_FLOW: FlowGraphData = {
  key: WHATSAPP_ROOT_FLOW_KEY,
  label: 'Menu do WhatsApp',
  nodes: {
    about: {
      directMessage: 'Os comandos pelo WhatsApp estão chegando. Por enquanto, use o painel.',
      id: 'about',
      type: 'action',
    },
    menu: {
      fallbackMessage: 'Toque numa das opções do menu.',
      id: 'menu',
      next: { byAnswer: { about: 'about' }, default: 'menu' },
      options: [['about', 'ℹ️ O que já dá']],
      question: 'Olá! O que você quer fazer?',
      type: 'menu',
    },
  },
  startNodeId: 'menu',
  version: 1,
}
