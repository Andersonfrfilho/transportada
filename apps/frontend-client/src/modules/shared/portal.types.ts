/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O payload mínimo da API (ADR-0050 §4). O portal não conhece id de nota, de viagem nem de parada. */
export type Delivery = Readonly<{
  accessKey: string
  deliveredAt: string | null
  estimatedArrivalAt: string | null
  issuedAt: string
  number: string
  returnReason: string | null
  separationStatus: string | null
  series: string
  tripStatus: string | null
}>

export type DeliveryLocation = Readonly<{
  latitude: string
  longitude: string
  recordedAt: string
}>

export type DeliveryEventKind =
  | 'arrived'
  | 'delivered'
  | 'en_route'
  | 'loaded'
  | 'received'
  | 'returned'
  | 'separated'

/** Spec 340 D4: marco da entrega (tipo e hora) e a coordenada da parada de destino — nunca de quem dirige. */
export type DeliveryEvents = Readonly<{
  destination: Readonly<{ latitude: string; longitude: string }> | null
  events: readonly Readonly<{ kind: DeliveryEventKind; occurredAt: string }>[]
}>

export type DeliverySchedule = Readonly<{
  divergedAt: string | null
  notes: string
  protocol: string
  scheduledAt: string | null
  status: string
}>

export type ScheduleInput = Readonly<{
  accessKey: string
  notes?: string
  protocol?: string
  scheduledAt: string | null
  status: 'confirmed' | 'refused'
}>

export type ChargeBatchItem = Readonly<{
  amount: string
  chargeType: string
  chargedOn: string
  clientName: string
  id: string
  notes: string
  rejectionReason: string
  status: string
}>

export type ChargeBatch = Readonly<{
  batch: Readonly<{
    closedAt: string
    id: string
    periodEnd: string
    periodStart: string
    status: string
    totalAmount: string
  }>
  items: readonly ChargeBatchItem[]
  itemsTotal: string
}>

export type ChargeDecision = Readonly<{
  chargeId: string
  decision: 'approved' | 'rejected'
  reason: string
}>

export type OccurrenceDecisionKind = 'goods_paid' | 'other' | 'redelivery_authorized'

/** A URL assinada (`thumbnailUrl`/`downloadUrl`) vence em 5 minutos — `expired` é outra coisa: a foto foi descartada por retenção e nunca mais tem URL nenhuma. */
export type OccurrenceAttachment = Readonly<{
  downloadUrl: string | null
  expired: boolean
  id: string
  position: number
  thumbnailUrl: string | null
}>

/** A API ainda não publica nota, itens da NF-e nem observação nesta lista — só o que está aqui. */
export type Occurrence = Readonly<{
  attachments: readonly OccurrenceAttachment[]
  caseStatus: string
  /**
   * Spec 183 T651/T653: a referência opaca da conversa com a transportadora — nunca o id dela.
   * `null` quando a conversa não é com a empresa desta conta (quem só recebe a nota, por exemplo).
   */
  conversationRef: string | null
  /** As mensagens da transportadora que esta conta ainda não leu — o botão da conversa mostra. */
  conversationUnreadCount: number
  decidedAt: string | null
  decisionKind: OccurrenceDecisionKind | null
  occurrenceId: string
  occurrenceTypeName: string
  openedAt: string
  stage: string
}>

export type OccurrenceDecisionInput = Readonly<{
  kind: OccurrenceDecisionKind
  note?: string
  occurrenceId: string
}>

export type OccurrenceDecisionResult = Readonly<{
  kind: 'changed' | 'unchanged'
  status: string
}>

/** Spec 183 T653: o canal por onde a mensagem entrou na conversa (D9 — a conversa é uma só). */
export type PortalConversationChannel = 'email' | 'portal' | 'whatsapp'

/**
 * A mensagem como o portal a recebe: sem id, sem autor da transportadora e sem nada do motorista
 * (ADR-0073 §5). `mine` diz se foi esta conta que escreveu.
 */
/** Spec 183 T702b: o anexo como o portal o recebe — sem id; a URL vale cinco minutos. */
export type PortalConversationAttachment = Readonly<{
  contentType: string
  fileName: string
  sizeBytes: number
  url: string
}>

export type PortalConversationMessage = Readonly<{
  attachments: readonly PortalConversationAttachment[]
  body: string
  channel: PortalConversationChannel
  createdAt: string
  mine: boolean
  side: 'carrier' | 'contractor'
}>

export type PortalConversation = Readonly<{
  messages: readonly PortalConversationMessage[]
  unreadCount: number
}>

export type PortalConversationMessageInput = Readonly<{
  /** Spec 183 T702b: os pedidos de upload desta conta, na ordem da escolha. */
  attachmentIds?: readonly string[]
  body: string
  idempotencyKey: string
  ref: string
}>

/** Spec 339: o pedido de coleta/entrega como o portal o vê — sem id de contratante, sem documento. */
export type PickupRequestKind = 'delivery' | 'pickup'
export type PickupRequestStatus =
  | 'accepted'
  | 'canceled'
  | 'done'
  | 'expired'
  | 'refused'
  | 'requested'
  | 'scheduled'

export type PickupRequestAddress = Readonly<{
  city: string
  cityIbgeCode: string | null
  complement: string | null
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type PickupRequest = Readonly<{
  acceptedWindowEnd: string | null
  acceptedWindowStart: string | null
  cargoDescription: string
  createdAt: string
  decisionNote: string | null
  destination: PickupRequestAddress
  expiresAt: string
  id: string
  kind: PickupRequestKind
  origin: PickupRequestAddress
  scheduled: boolean
  status: PickupRequestStatus
  volumes: number
  weightKg: string
  windowEnd: string
  windowStart: string
}>

export type PickupRequestInput = Readonly<{
  cargoDescription: string
  destination: PickupRequestAddress
  idempotencyKey: string
  kind: PickupRequestKind
  note: string | null
  origin: PickupRequestAddress
  requesterEmail: string | null
  requesterName: string
  requesterPhone: string | null
  volumes: number
  weightKg: string
  windowEnd: string
  windowStart: string
}>
