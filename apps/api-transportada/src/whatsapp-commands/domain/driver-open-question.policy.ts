/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O portão "este motorista tem pergunta aberta do bot?". A oferta da próxima rota (spec 294) e o lembrete da
 * parada (spec 299) decidem pela mesma regra; o lembrete lê além o pedido aberto do grupo.
 */
/**
 * RNF1: a oferta só abre pergunta quando nada mais espera resposta deste motorista — ocorrência ou entrega em
 * preparo, escolha de parada, outra oferta ou pedido de localização, áudio esperando confirmação.
 */
export type RouteOfferGate = {
  readonly hasOpenCollection: boolean
  readonly hasOpenStopChoice: boolean
  readonly hasPendingAudio: boolean
  readonly hasPendingPrompt: boolean
}

export function canAskRouteOffer(gate: RouteOfferGate): boolean {
  return !(
    gate.hasOpenCollection ||
    gate.hasOpenStopChoice ||
    gate.hasPendingAudio ||
    gate.hasPendingPrompt
  )
}

/** O que o lembrete lê: o portão da oferta mais o pedido aberto do grupo do motorista. */
export type DriverOpenQuestions = RouteOfferGate & { readonly hasOpenGroupRequest: boolean }

export function hasDriverOpenQuestion(questions: DriverOpenQuestions): boolean {
  return !canAskRouteOffer(questions) || questions.hasOpenGroupRequest
}
