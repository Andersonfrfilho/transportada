/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

/**
 * Chave estável do grafo raiz do produto. `conversation-flow.md §7`: id sem acento, e é ele que
 * amarra a posição de sessão (`user_whatsapp_phones`/`ConversationSession`) e a linha viva na
 * `FlowGraphRepository` do módulo — trocar esta chave descontinua o grafo publicado, não o edita.
 */
export const WHATSAPP_ROOT_FLOW_GRAPH_KEY = 'transportada_root'

/**
 * Spec 144 T008 — o grafo raiz **definitivo**, republicável a partir do código
 * (`conversation-flow.md §1`, RF8). Substitui `domain/whatsapp-root-flow.constant.ts`, que era o
 * grafo provisório da T006 (ainda usado nos testes do despachante que não montam o publicador).
 *
 * O menu raiz tem sempre as três opções publicadas: quem esconde a que a membership não alcança é o
 * driver (D2, `whatsapp-root-menu.policy.ts`), nunca o grafo — o grafo é o mesmo para toda empresa.
 * Cada ramo ainda sem ação (emissão fiscal T012/T013, entrega do motorista T015, operador T016)
 * termina num nó terminal explícito: nó sem saída é proibido (`conversation-flow.md §5`), e "Em
 * breve." é honesto sobre o que ainda não existe — melhor do que fingir uma ação que ainda não roda.
 *
 * A verificação de entrada (T004) não é opção deste menu: ela é pré-passo do despachante, resolvido
 * antes de qualquer grafo (`whatsapp-command-driver.service.ts`).
 */
export const WHATSAPP_ROOT_FLOW_GRAPH: FlowGraphData = {
  key: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
  label: 'Menu do WhatsApp',
  nodes: {
    emitir_documentos_em_breve: {
      directMessage: 'Emitir documentos pelo WhatsApp está chegando. Por enquanto, use o painel.',
      id: 'emitir_documentos_em_breve',
      type: 'action',
    },
    menu: {
      fallbackMessage: 'Toque numa das opções do menu.',
      id: 'menu',
      next: {
        byAnswer: {
          emitir_documentos: 'emitir_documentos_em_breve',
          minha_viagem: 'minha_viagem_em_breve',
          viagens_armazem: 'viagens_armazem_em_breve',
        },
        default: 'menu',
      },
      options: [
        ['emitir_documentos', '📄 Emitir documentos'],
        ['minha_viagem', '🚚 Minha viagem'],
        ['viagens_armazem', '🏭 Viagens do armazém'],
      ],
      question: 'Olá! O que você quer fazer?',
      type: 'menu',
    },
    minha_viagem_em_breve: {
      directMessage: 'Acompanhar a viagem pelo WhatsApp está chegando. Por enquanto, use o painel.',
      id: 'minha_viagem_em_breve',
      type: 'action',
    },
    viagens_armazem_em_breve: {
      directMessage: 'Separar e despachar pelo WhatsApp está chegando. Por enquanto, use o painel.',
      id: 'viagens_armazem_em_breve',
      type: 'action',
    },
  },
  startNodeId: 'menu',
  version: 1,
}
