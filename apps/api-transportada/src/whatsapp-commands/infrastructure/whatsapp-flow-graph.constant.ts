/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import { DRIVER_RETURN_REASONS } from '../../trips/domain/driver-return-reason.policy.js'
import {
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
  DRIVER_RETURN_REASON_LABELS,
} from '../domain/whatsapp-driver-flow.constant.js'
import {
  ISSUANCE_FLOW_ACTION_KIND,
  ISSUANCE_FLOW_CONTEXT_KEY,
  ISSUANCE_FLOW_NODE,
} from '../domain/whatsapp-issuance-flow.constant.js'
import {
  OPERATOR_DISPATCH_CONFIRM_ANSWER,
  OPERATOR_FLOW_ACTION_KIND,
  OPERATOR_FLOW_CONTEXT_KEY,
  OPERATOR_FLOW_NODE,
} from '../domain/whatsapp-operator-flow.constant.js'

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
 * As três opções apontam para ramos reais: a emissão por seleção (T012), o motorista (T015) e o
 * operador do armazém (T016).
 *
 * A verificação de entrada (T004) não é opção deste menu: ela é pré-passo do despachante, resolvido
 * antes de qualquer grafo (`whatsapp-command-driver.service.ts`).
 */
export const WHATSAPP_ROOT_FLOW_GRAPH: FlowGraphData = {
  key: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
  label: 'Menu do WhatsApp',
  nodes: {
    menu: {
      fallbackMessage: 'Toque numa das opções do menu.',
      id: 'menu',
      next: {
        byAnswer: {
          emitir_documentos: ISSUANCE_FLOW_NODE.start,
          minha_viagem: DRIVER_FLOW_NODE.currentTrip,
          viagens_armazem: OPERATOR_FLOW_NODE.listTrips,
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
    ...buildIssuanceFlowNodes(),
    ...buildDriverTripFlowNodes(),
    ...buildOperatorTripFlowNodes(),
  },
  startNodeId: 'menu',
  version: 1,
}

/**
 * Spec 144 T012 — o ramo "Emitir documentos". Só o menu de critério é estático (quatro opções,
 * lista); cada parâmetro é perguntado pela FlowAction `prompt`, e a resposta volta pelo mesmo
 * `entrada_choice` + roteador, um parâmetro por mensagem (D4). A prévia termina num segundo
 * `entrada_choice`, o do botão de confirmar, que carrega o id do pedido congelado (D5).
 */
function buildIssuanceFlowNodes(): FlowGraphData['nodes'] {
  return {
    [ISSUANCE_FLOW_NODE.start]: {
      actionKind: ISSUANCE_FLOW_ACTION_KIND.start,
      id: ISSUANCE_FLOW_NODE.start,
      type: 'action',
    },
    [ISSUANCE_FLOW_NODE.criterionMenu]: {
      contextKey: ISSUANCE_FLOW_CONTEXT_KEY.criterion,
      fallbackMessage: 'Toque num dos critérios da lista.',
      id: ISSUANCE_FLOW_NODE.criterionMenu,
      next: ISSUANCE_FLOW_NODE.prompt,
      options: [
        ['number_range', '🔢 Faixa de número'],
        ['trip', '🚚 Viagem'],
        ['issue_date', '📅 Data de emissão'],
        ['sender', '🏢 Remetente'],
      ],
      question: 'Como você quer escolher as notas?',
      type: 'menu',
    },
    [ISSUANCE_FLOW_NODE.prompt]: {
      actionKind: ISSUANCE_FLOW_ACTION_KIND.prompt,
      id: ISSUANCE_FLOW_NODE.prompt,
      type: 'action',
    },
    [ISSUANCE_FLOW_NODE.paramEntry]: {
      contextKey: ISSUANCE_FLOW_CONTEXT_KEY.answer,
      id: ISSUANCE_FLOW_NODE.paramEntry,
      next: ISSUANCE_FLOW_NODE.paramRouter,
      question: 'Responda à pergunta acima.',
      type: 'entrada_choice',
    },
    [ISSUANCE_FLOW_NODE.paramRouter]: {
      actionKind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
      id: ISSUANCE_FLOW_NODE.paramRouter,
      type: 'action',
    },
    [ISSUANCE_FLOW_NODE.confirmEntry]: {
      contextKey: ISSUANCE_FLOW_CONTEXT_KEY.confirmAnswer,
      id: ISSUANCE_FLOW_NODE.confirmEntry,
      next: ISSUANCE_FLOW_NODE.confirmRouter,
      question: 'Toque em Confirmar ou Voltar, na lista acima.',
      type: 'entrada_choice',
    },
    [ISSUANCE_FLOW_NODE.confirmRouter]: {
      actionKind: ISSUANCE_FLOW_ACTION_KIND.confirmRouter,
      id: ISSUANCE_FLOW_NODE.confirmRouter,
      type: 'action',
    },
  }
}

/**
 * Spec 144 T015 — o ramo "Minha viagem": consulta a viagem ativa, e entregar/devolver/registrar
 * ocorrência. Toda lista dinâmica (notas, tipos de ocorrência) é mandada pela própria `FlowAction`
 * (`register-driver-flow-actions.ts`) — o nó `action` busca e envia, o `entrada_choice` que vem
 * depois só captura a resposta, e um segundo `action` (o "roteador") decide o próximo passo. Só o
 * menu da viagem (3 opções fixas) e a lista de motivos de devolução (5 motivos fixos) são opções
 * estáticas de verdade.
 */
function buildDriverTripFlowNodes(): FlowGraphData['nodes'] {
  return {
    [DRIVER_FLOW_NODE.currentTrip]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.currentTrip,
      id: DRIVER_FLOW_NODE.currentTrip,
      type: 'action',
    },
    [DRIVER_FLOW_NODE.tripMenu]: {
      contextKey: DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice,
      fallbackMessage: 'Toque numa das opções.',
      id: DRIVER_FLOW_NODE.tripMenu,
      next: DRIVER_FLOW_NODE.listDocuments,
      options: [
        ['deliver', '📦 Entregar'],
        ['return', '↩️ Devolver'],
        ['occurrence', '⚠️ Ocorrência'],
      ],
      question: 'O que você quer fazer com esta viagem?',
      type: 'menu',
    },
    [DRIVER_FLOW_NODE.listDocuments]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.listDocuments,
      id: DRIVER_FLOW_NODE.listDocuments,
      type: 'action',
    },
    [DRIVER_FLOW_NODE.documentEntry]: {
      contextKey: DRIVER_FLOW_CONTEXT_KEY.documentAnswer,
      id: DRIVER_FLOW_NODE.documentEntry,
      next: DRIVER_FLOW_NODE.documentRouter,
      question: 'Toque numa nota da lista acima.',
      type: 'entrada_choice',
    },
    [DRIVER_FLOW_NODE.documentRouter]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.documentRouter,
      id: DRIVER_FLOW_NODE.documentRouter,
      type: 'action',
    },
    [DRIVER_FLOW_NODE.returnReasonMenu]: {
      contextKey: DRIVER_FLOW_CONTEXT_KEY.returnReason,
      fallbackMessage: 'Toque no motivo da devolução.',
      id: DRIVER_FLOW_NODE.returnReasonMenu,
      next: DRIVER_FLOW_NODE.returnReasonRouter,
      options: DRIVER_RETURN_REASONS.map(
        (reason) => [reason, DRIVER_RETURN_REASON_LABELS[reason] ?? reason] as [string, string],
      ),
      question: 'Qual foi o motivo da devolução?',
      type: 'menu',
    },
    [DRIVER_FLOW_NODE.returnReasonRouter]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.completeReturn,
      id: DRIVER_FLOW_NODE.returnReasonRouter,
      type: 'action',
    },
    [DRIVER_FLOW_NODE.listOccurrenceTypes]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.listOccurrenceTypes,
      id: DRIVER_FLOW_NODE.listOccurrenceTypes,
      type: 'action',
    },
    [DRIVER_FLOW_NODE.occurrenceTypeEntry]: {
      contextKey: DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeAnswer,
      id: DRIVER_FLOW_NODE.occurrenceTypeEntry,
      next: DRIVER_FLOW_NODE.occurrenceTypeRouter,
      question: 'Toque no tipo da lista acima.',
      type: 'entrada_choice',
    },
    [DRIVER_FLOW_NODE.occurrenceTypeRouter]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.occurrenceTypeRouter,
      id: DRIVER_FLOW_NODE.occurrenceTypeRouter,
      type: 'action',
    },
    [DRIVER_FLOW_NODE.notePrompt]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.notePrompt,
      id: DRIVER_FLOW_NODE.notePrompt,
      type: 'action',
    },
    [DRIVER_FLOW_NODE.noteEntry]: {
      contextKey: DRIVER_FLOW_CONTEXT_KEY.noteAnswer,
      id: DRIVER_FLOW_NODE.noteEntry,
      next: DRIVER_FLOW_NODE.noteRouter,
      question: 'Digite o texto, ou toque em Pular.',
      type: 'entrada_choice',
    },
    [DRIVER_FLOW_NODE.noteRouter]: {
      actionKind: DRIVER_FLOW_ACTION_KIND.completeOccurrence,
      id: DRIVER_FLOW_NODE.noteRouter,
      type: 'action',
    },
  }
}

/**
 * Spec 144 T016 — o ramo "Viagens do armazém": lista as viagens ainda no barracão, e o menu de ação
 * de cada uma é dinâmico (derivado de `resolveOperatorTripActions`, nunca uma lista fixa neste
 * grafo) — por isso ele também é `action` + `entrada_choice`, como as listas de nota do motorista.
 * Só a confirmação de despacho é estática de verdade: duas opções fixas, ≤3 então botão com emoji
 * (`conversation-flow.md §2`).
 */
function buildOperatorTripFlowNodes(): FlowGraphData['nodes'] {
  return {
    [OPERATOR_FLOW_NODE.listTrips]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.listTrips,
      id: OPERATOR_FLOW_NODE.listTrips,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.tripEntry]: {
      contextKey: OPERATOR_FLOW_CONTEXT_KEY.tripAnswer,
      id: OPERATOR_FLOW_NODE.tripEntry,
      next: OPERATOR_FLOW_NODE.tripRouter,
      question: 'Toque numa viagem da lista acima.',
      type: 'entrada_choice',
    },
    [OPERATOR_FLOW_NODE.tripRouter]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.tripRouter,
      id: OPERATOR_FLOW_NODE.tripRouter,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.tripActionMenu]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.tripActionMenu,
      id: OPERATOR_FLOW_NODE.tripActionMenu,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.actionEntry]: {
      contextKey: OPERATOR_FLOW_CONTEXT_KEY.actionAnswer,
      id: OPERATOR_FLOW_NODE.actionEntry,
      next: OPERATOR_FLOW_NODE.actionRouter,
      question: 'Toque numa das opções acima.',
      type: 'entrada_choice',
    },
    [OPERATOR_FLOW_NODE.actionRouter]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.actionRouter,
      id: OPERATOR_FLOW_NODE.actionRouter,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.listDocuments]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.listDocuments,
      id: OPERATOR_FLOW_NODE.listDocuments,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.documentEntry]: {
      contextKey: OPERATOR_FLOW_CONTEXT_KEY.documentAnswer,
      id: OPERATOR_FLOW_NODE.documentEntry,
      next: OPERATOR_FLOW_NODE.documentRouter,
      question: 'Toque na nota da lista acima.',
      type: 'entrada_choice',
    },
    [OPERATOR_FLOW_NODE.documentRouter]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
      id: OPERATOR_FLOW_NODE.documentRouter,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.dispatchConfirmMenu]: {
      contextKey: OPERATOR_FLOW_CONTEXT_KEY.dispatchConfirmAnswer,
      fallbackMessage: 'Toque numa das opções.',
      id: OPERATOR_FLOW_NODE.dispatchConfirmMenu,
      next: OPERATOR_FLOW_NODE.dispatchConfirmRouter,
      options: [
        [OPERATOR_DISPATCH_CONFIRM_ANSWER.confirm, '✅ Confirmar'],
        [OPERATOR_DISPATCH_CONFIRM_ANSWER.cancel, '🔙 Voltar'],
      ],
      question: 'Despachar a viagem não pode ser desfeito por aqui. Confirma?',
      type: 'menu',
    },
    [OPERATOR_FLOW_NODE.dispatchConfirmRouter]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.dispatchConfirmRouter,
      id: OPERATOR_FLOW_NODE.dispatchConfirmRouter,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.listOccurrenceTypes]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.listOccurrenceTypes,
      id: OPERATOR_FLOW_NODE.listOccurrenceTypes,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.occurrenceTypeEntry]: {
      contextKey: OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeAnswer,
      id: OPERATOR_FLOW_NODE.occurrenceTypeEntry,
      next: OPERATOR_FLOW_NODE.occurrenceTypeRouter,
      question: 'Toque no tipo da lista acima.',
      type: 'entrada_choice',
    },
    [OPERATOR_FLOW_NODE.occurrenceTypeRouter]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.occurrenceTypeRouter,
      id: OPERATOR_FLOW_NODE.occurrenceTypeRouter,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.notePrompt]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.notePrompt,
      id: OPERATOR_FLOW_NODE.notePrompt,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.noteEntry]: {
      contextKey: OPERATOR_FLOW_CONTEXT_KEY.noteAnswer,
      id: OPERATOR_FLOW_NODE.noteEntry,
      next: OPERATOR_FLOW_NODE.noteRouter,
      question: 'Digite o texto, ou toque em Pular.',
      type: 'entrada_choice',
    },
    /**
     * Spec 161 T15 (RF18): a observação não completa mais a ocorrência direto — passa pelo passo
     * de foto, porque D1/RF4 exige a foto antes de qualquer ocorrência de galpão nascer, e o
     * WhatsApp não é exceção (T13).
     */
    [OPERATOR_FLOW_NODE.noteRouter]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.photoPrompt,
      id: OPERATOR_FLOW_NODE.noteRouter,
      type: 'action',
    },
    [OPERATOR_FLOW_NODE.photoEntry]: {
      contextKey: OPERATOR_FLOW_CONTEXT_KEY.photoAnswer,
      id: OPERATOR_FLOW_NODE.photoEntry,
      next: OPERATOR_FLOW_NODE.photoRouter,
      question: 'Envie a foto, toque em ✅ Concluir ou em ❌ Cancelar ocorrência.',
      type: 'entrada_choice',
    },
    [OPERATOR_FLOW_NODE.photoRouter]: {
      actionKind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
      id: OPERATOR_FLOW_NODE.photoRouter,
      type: 'action',
    },
  }
}
