/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryEventKind } from '@/modules/shared/portal.types'

/** Spec 340 D4: o vocabulário do cliente para cada marco — o do galpão (`separated`, `loaded`) vira frase de quem espera. */
export const DELIVERY_EVENT_LABEL: Readonly<Record<DeliveryEventKind, string>> = {
  arrived: 'Chegou ao destino',
  delivered: 'Entregue',
  en_route: 'Saiu para a entrega',
  loaded: 'Carga embarcada',
  received: 'Nota recebida pela transportadora',
  returned: 'Devolvida',
  separated: 'Separada para o envio',
}
