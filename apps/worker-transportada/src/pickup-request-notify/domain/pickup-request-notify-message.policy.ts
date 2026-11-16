/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 339 T4: o texto de cada aviso. É só texto — o visual do e-mail é o modelo padrão de e-mail da empresa
 * (`notification.standard-email`), nunca layout em código. Valores de pessoa entram como texto puro; o renderizador do
 * modelo escapa.
 */
export type PickupNotificationEvent =
  | 'accepted'
  | 'canceled'
  | 'expired'
  | 'refused'
  | 'requested'
  | 'scheduled'
  | 'stale'
export type PickupNotificationAudience = 'client' | 'office'

export type PickupNotificationRequest = {
  readonly cargoDescription: string
  readonly decisionNote: string | null
  readonly destinationCity: string
  readonly kind: 'delivery' | 'pickup'
  readonly originCity: string
  readonly requesterName: string
  readonly windowEnd: string
  readonly windowStart: string
}

export type PickupNotificationMessage = { readonly body: string; readonly subject: string }

const KIND_LABEL = { delivery: 'entrega', pickup: 'coleta' } as const

/** `yyyy-mm-dd` → `dd/mm/aaaa`. */
export function formatPickupDay(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

function windowText(request: PickupNotificationRequest): string {
  return request.windowStart === request.windowEnd
    ? `em ${formatPickupDay(request.windowStart)}`
    : `entre ${formatPickupDay(request.windowStart)} e ${formatPickupDay(request.windowEnd)}`
}

function summary(request: PickupNotificationRequest): string {
  return [
    `Origem: ${request.originCity}`,
    `Destino: ${request.destinationCity}`,
    `Janela: ${windowText(request)}`,
    `Carga: ${request.cargoDescription}`,
  ].join('\n')
}

export function buildPickupNotificationMessage(input: {
  readonly audience: PickupNotificationAudience
  readonly event: PickupNotificationEvent
  readonly link: string | null
  readonly request: PickupNotificationRequest
}): PickupNotificationMessage {
  const { audience, event, link, request } = input
  const kind = KIND_LABEL[request.kind]
  const tail = link === null ? '' : `\n\nAbrir: ${link}`
  const noteLine =
    request.decisionNote === null || request.decisionNote.trim() === ''
      ? ''
      : `\n\nMotivo/observação: ${request.decisionNote.trim()}`

  if (audience === 'office') {
    if (event === 'requested') {
      return {
        body: `${request.requesterName} pediu uma ${kind}.\n\n${summary(request)}${tail}`,
        subject: `Novo pedido de ${kind}: ${request.requesterName}`,
      }
    }
    if (event === 'canceled') {
      return {
        body: `${request.requesterName} cancelou o pedido de ${kind}.\n\n${summary(request)}${tail}`,
        subject: `Pedido de ${kind} cancelado: ${request.requesterName}`,
      }
    }
    return {
      body: `O pedido de ${kind} de ${request.requesterName} está sem resposta há mais de um dia útil e vai expirar se ninguém decidir.\n\n${summary(request)}${tail}`,
      subject: `Pedido de ${kind} sem resposta: ${request.requesterName}`,
    }
  }
  switch (event) {
    case 'accepted':
      return {
        body: `Seu pedido de ${kind} foi aceito. Assim que a data for confirmada você recebe outro aviso.\n\n${summary(request)}${noteLine}${tail}`,
        subject: `Pedido de ${kind} aceito`,
      }
    case 'scheduled':
      return {
        body: `Sua ${kind} foi confirmada.\n\n${summary(request)}${noteLine}${tail}`,
        subject: `${kind === 'coleta' ? 'Coleta' : 'Entrega'} confirmada`,
      }
    case 'refused':
      return {
        body: `Não conseguimos atender seu pedido de ${kind}.\n\n${summary(request)}${noteLine}${tail}`,
        subject: `Pedido de ${kind} não aceito`,
      }
    case 'expired':
      return {
        body: `Seu pedido de ${kind} ficou sem resposta e foi encerrado. Se ainda precisar, faça um novo pedido.\n\n${summary(request)}${tail}`,
        subject: `Pedido de ${kind} encerrado sem resposta`,
      }
    default:
      return {
        body: `Atualização do seu pedido de ${kind}.\n\n${summary(request)}${tail}`,
        subject: `Atualização do pedido de ${kind}`,
      }
  }
}
