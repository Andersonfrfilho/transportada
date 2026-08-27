/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Delivery } from '@/modules/shared/portal.types'

export type DeliveryStage = 'delivered' | 'received' | 'returned' | 'separating' | 'transit'

export type DeliveryView = Readonly<{
  badge: 'alert' | 'done' | 'pending' | 'transit'
  label: string
  stage: DeliveryStage
}>

/**
 * O vocabulário da transportadora não é o do cliente. `separating`/`loaded` são o que acontece no
 * galpão dela; o cliente quer saber se a nota **saiu**. A tradução mora aqui, num lugar só, e é ela
 * que faz `null` — nota importada e ainda parada — virar "recebida" em vez de sumir.
 */
export function toDeliveryView(delivery: Delivery): DeliveryView {
  if (delivery.separationStatus === 'returned') {
    return { badge: 'alert', label: 'Devolvida', stage: 'returned' }
  }
  if (delivery.deliveredAt !== null || delivery.separationStatus === 'delivered') {
    return { badge: 'done', label: 'Entregue', stage: 'delivered' }
  }
  if (delivery.tripStatus === 'dispatched' || delivery.tripStatus === 'in_transit') {
    return { badge: 'transit', label: 'A caminho', stage: 'transit' }
  }
  if (delivery.separationStatus !== null) {
    return { badge: 'pending', label: 'Em separação', stage: 'separating' }
  }

  return { badge: 'pending', label: 'Recebida', stage: 'received' }
}

/** O mapa só faz sentido enquanto a carga está na rua — depois disso o rastro nem existe mais. */
export function isTrackable(delivery: Delivery): boolean {
  return toDeliveryView(delivery).stage === 'transit'
}

/** Agendar só vale antes de a carga sair: depois disso a janela já foi usada ou perdida. */
export function isSchedulable(delivery: Delivery): boolean {
  const stage = toDeliveryView(delivery).stage
  return stage === 'received' || stage === 'separating'
}
