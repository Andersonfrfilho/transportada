/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O motorista manda "saí"/"cheguei" numa viagem planejada e ainda não despachada. Em vez de só recusar, o bot
 * **pergunta ao responsável do escritório** (quem planejou a viagem) se ela pode ser despachada, e, aprovado, despacha
 * pelo mesmo caso de uso do painel e lança o que o motorista mandou, com a hora em que ele mandou.
 *
 * Regras: um pedido aberto por viagem; só o responsável responde, e só com a permissão de despachar; pelo WhatsApp só
 * despacha se a carga já está fechada (sem carregar o que sobra: isso é do painel); 10 minutos, com um reaviso na
 * metade; sem resposta o pedido vence e **nada é despachado sozinho**.
 */
import {
  DISPATCH_APPROVAL_TEXT,
  interpretDispatchAnswer,
  TRIP_DISPATCH_APPROVAL_REMINDER_AFTER_MS,
  TRIP_DISPATCH_APPROVAL_TIMEOUT_MS,
  type PendingDriverStopEvent,
} from '../domain/trip-dispatch-approval.policy.js'

export type TripDispatchRequestRecord = {
  readonly companyId: string
  readonly driverId: string
  readonly groupJid: string
  readonly id: string
  readonly pendingEvents: readonly PendingDriverStopEvent[]
  readonly responderPhone: string
  readonly responderUserId: string
  readonly tripId: string
}

export type TripDispatchResolution = 'approved' | 'declined' | 'expired' | 'failed'

export type TripDispatchApprovalPorts = {
  readonly clock?: () => Date
  /** A carga já está fechada (nada a carregar)? Só então o WhatsApp despacha. */
  isCargoClosed(input: { readonly companyId: string; readonly tripId: string }): Promise<boolean>
  /** Despacha pelo caso de uso do painel (sem `loadRemaining`, sem `force`). Lança se a viagem não pode sair. */
  dispatch(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly tripId: string
  }): Promise<void>
  /** O usuário que este telefone identifica **e** que pode despachar; `null` caso contrário. */
  findDispatcher(input: {
    readonly companyId: string
    readonly phone: string
  }): Promise<null | { readonly userId: string }>
  /** Quem planejou a viagem e tem telefone verificado; `null` se não há. */
  findResponder(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | { readonly phone: string; readonly userId: string }>
  readDriverName(input: { readonly companyId: string; readonly driverId: string }): Promise<string>
  /** Lança um evento guardado na viagem agora despachada; devolve a frase do registro para o motorista. */
  replay(input: {
    readonly companyId: string
    readonly driverId: string
    readonly event: PendingDriverStopEvent
    readonly requestId: string
  }): Promise<string>
  repository: {
    appendEvent(input: {
      readonly companyId: string
      readonly event: PendingDriverStopEvent
      readonly id: string
    }): Promise<void>
    claimExpired(now: Date): Promise<readonly TripDispatchRequestRecord[]>
    claimReminders(input: {
      readonly afterMs: number
      readonly now: Date
    }): Promise<readonly TripDispatchRequestRecord[]>
    findOpenByResponder(input: {
      readonly companyId: string
      readonly phone: string
    }): Promise<null | TripDispatchRequestRecord>
    findOpenByTrip(input: {
      readonly companyId: string
      readonly tripId: string
    }): Promise<null | TripDispatchRequestRecord>
    /** `false` quando o pedido já não estava aberto (resposta repetida, vencimento no meio). */
    insert(input: {
      readonly companyId: string
      readonly driverId: string
      readonly event: PendingDriverStopEvent
      readonly expiresAt: Date
      readonly groupJid: string
      readonly responderPhone: string
      readonly responderUserId: string
      readonly tripId: string
    }): Promise<boolean>
    resolve(input: {
      readonly companyId: string
      readonly id: string
      readonly note?: string
      readonly now: Date
      readonly status: TripDispatchResolution
    }): Promise<boolean>
  }
  /** Uma mensagem a um chat (direto ou grupo). */
  send(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly texts: readonly string[]
  }): void
}

export type RequestTripDispatchInput = {
  readonly companyId: string
  readonly driverId: string
  readonly event: PendingDriverStopEvent
  readonly groupJid: string
  readonly tripId: string
}

/** O que o fluxo do motorista diz a ele. */
export type RequestTripDispatchOutcome = { readonly replies: readonly string[] }

export type TripDispatchApproval = {
  /** A resposta do responsável (mensagem direta). `true` quando a mensagem era dele e foi tratada. */
  answer(input: {
    readonly companyId: string
    readonly phone: string
    readonly text: string
  }): Promise<boolean>
  request(input: RequestTripDispatchInput): Promise<RequestTripDispatchOutcome>
  /** Reaviso na metade do prazo e vencimento; chamado pelo vigia. */
  tick(): Promise<void>
}

/**
 * A ponte que liga o fluxo do "saí/cheguei" (montado cedo) ao serviço (montado onde há o envio do Evolution): vazia
 * até a composição do webhook preenchê-la; vazia, o bot só avisa que a viagem não foi despachada.
 */
export type TripDispatchBridge = { current?: Pick<TripDispatchApproval, 'request'> }

const directJid = (phone: string) => `${phone}@s.whatsapp.net`

export function createTripDispatchApproval(ports: TripDispatchApprovalPorts): TripDispatchApproval {
  const clock = ports.clock ?? (() => new Date())
  const { repository } = ports

  return {
    async answer({ companyId, phone, text }) {
      const request = await repository.findOpenByResponder({ companyId, phone })
      if (request === null) return false
      const reply = (texts: readonly string[]) =>
        ports.send({ companyId, groupJid: directJid(request.responderPhone), texts })

      const answer = interpretDispatchAnswer(text)
      if (answer === null) {
        reply([DISPATCH_APPROVAL_TEXT.notUnderstood])
        return true
      }
      const now = clock()
      if (answer === 'no') {
        if (await repository.resolve({ companyId, id: request.id, now, status: 'declined' })) {
          reply([DISPATCH_APPROVAL_TEXT.declinedOffice])
          ports.send({
            companyId,
            groupJid: request.groupJid,
            texts: [DISPATCH_APPROVAL_TEXT.declinedDriver],
          })
        }
        return true
      }
      const dispatcher = await ports.findDispatcher({ companyId, phone })
      if (dispatcher === null) {
        reply([DISPATCH_APPROVAL_TEXT.notAllowed])
        if (
          await repository.resolve({
            companyId,
            id: request.id,
            note: 'not_allowed',
            now,
            status: 'failed',
          })
        ) {
          ports.send({
            companyId,
            groupJid: request.groupJid,
            texts: [DISPATCH_APPROVAL_TEXT.dispatchFailedDriver],
          })
        }
        return true
      }
      // Reserva o pedido antes de despachar: uma resposta repetida não despacha nem lança duas vezes.
      if (!(await repository.resolve({ companyId, id: request.id, now, status: 'approved' }))) {
        return true
      }
      try {
        await ports.dispatch({ actorUserId: dispatcher.userId, companyId, tripId: request.tripId })
      } catch {
        await repository.resolve({
          companyId,
          id: request.id,
          note: 'dispatch_failed',
          now: clock(),
          status: 'failed',
        })
        reply([DISPATCH_APPROVAL_TEXT.dispatchFailedOffice])
        ports.send({
          companyId,
          groupJid: request.groupJid,
          texts: [DISPATCH_APPROVAL_TEXT.dispatchFailedDriver],
        })
        return true
      }
      const events = [...request.pendingEvents].sort(
        (left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt),
      )
      const texts: string[] = [DISPATCH_APPROVAL_TEXT.dispatchedDriver(events)]
      for (const event of events) {
        try {
          texts.push(
            await ports.replay({
              companyId,
              driverId: request.driverId,
              event,
              requestId: request.id,
            }),
          )
        } catch {
          texts.push(DISPATCH_APPROVAL_TEXT.dispatchFailedDriver)
          break
        }
      }
      reply([DISPATCH_APPROVAL_TEXT.dispatchedOffice])
      ports.send({ companyId, groupJid: request.groupJid, texts })
      return true
    },

    async request(input) {
      const { companyId, driverId, event, groupJid, tripId } = input
      const open = await repository.findOpenByTrip({ companyId, tripId })
      if (open !== null) {
        const known = open.pendingEvents.some(
          (pending) => pending.event === event.event && pending.stopId === event.stopId,
        )
        if (!known) await repository.appendEvent({ companyId, event, id: open.id })
        return { replies: [DISPATCH_APPROVAL_TEXT.alreadyAsked] }
      }
      const responder = await ports.findResponder({ companyId, tripId })
      if (responder === null) return { replies: [DISPATCH_APPROVAL_TEXT.noResponder] }
      const driverName = await ports.readDriverName({ companyId, driverId })
      if (!(await ports.isCargoClosed({ companyId, tripId }))) {
        ports.send({
          companyId,
          groupJid: directJid(responder.phone),
          texts: [DISPATCH_APPROVAL_TEXT.cargoOpenOffice(driverName)],
        })
        return { replies: [DISPATCH_APPROVAL_TEXT.cargoOpenDriver] }
      }
      const created = await repository.insert({
        companyId,
        driverId,
        event,
        expiresAt: new Date(clock().getTime() + TRIP_DISPATCH_APPROVAL_TIMEOUT_MS),
        groupJid,
        responderPhone: responder.phone,
        responderUserId: responder.userId,
        tripId,
      })
      if (!created) return { replies: [DISPATCH_APPROVAL_TEXT.alreadyAsked] }
      ports.send({
        companyId,
        groupJid: directJid(responder.phone),
        texts: [DISPATCH_APPROVAL_TEXT.question({ driverName, events: [event] })],
      })
      return { replies: [DISPATCH_APPROVAL_TEXT.asked({ events: [event] })] }
    },

    async tick() {
      const now = clock()
      for (const request of await repository.claimExpired(now)) {
        ports.send({
          companyId: request.companyId,
          groupJid: directJid(request.responderPhone),
          texts: [DISPATCH_APPROVAL_TEXT.expiredOffice],
        })
        ports.send({
          companyId: request.companyId,
          groupJid: request.groupJid,
          texts: [DISPATCH_APPROVAL_TEXT.expiredDriver],
        })
      }
      for (const request of await repository.claimReminders({
        afterMs: TRIP_DISPATCH_APPROVAL_REMINDER_AFTER_MS,
        now,
      })) {
        ports.send({
          companyId: request.companyId,
          groupJid: directJid(request.responderPhone),
          texts: [DISPATCH_APPROVAL_TEXT.reminder],
        })
      }
    },
  }
}
