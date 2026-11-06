/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * **A parada em andamento**, igual no grupo e na conversa individual: a que chegou e falta a baixa ou, sem ela, a que está
 * a caminho. O "entreguei" sem número continua por ela em vez de listar todas as notas da viagem (defeito de staging: o
 * motorista na parada da NF 899840 recebeu a lista das sete notas abertas). Uma nota em aberto vem com o bloco da parada
 * (#552) para a resposta que segue direto para ela; várias, só as notas, para a pergunta listar.
 */
import {
  findStopAwaitingSettlement,
  findStopEnRoute,
  type WhatsAppStopCandidate,
} from '../../trips/domain/driver-stop-resolution.policy.js'
import { cardFromStopCandidate } from '../domain/whatsapp-driver-journey.policy.js'
import { describeStopCard } from '../domain/whatsapp-stop-card.policy.js'
import type { WhatsAppStopCardReader } from '../infrastructure/whatsapp-stop-card.reader.js'

export type WhatsAppStopInProgress = {
  readonly documents: readonly {
    readonly id: string
    readonly number: string
    readonly recipientName?: string | undefined
  }[]
  /** O bloco da parada quando só uma nota está em aberto; `null` com várias (a pergunta lista). */
  readonly header: null | string
  readonly stopId: string
}

const CLOSED_DOCUMENT = new Set(['delivered', 'returned'])

export async function readWhatsAppStopInProgress(input: {
  readonly actor: { readonly companyId: string; readonly driverId: string }
  readonly listStops: (scope: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly WhatsAppStopCandidate[]>
  readonly stopCards?: Pick<WhatsAppStopCardReader, 'read'> | undefined
}): Promise<null | WhatsAppStopInProgress> {
  const { actor } = input
  const stops = await input.listStops(actor)
  const stop = findStopAwaitingSettlement(stops) ?? findStopEnRoute(stops)
  if (stop === undefined) return null
  const documents = stop.documents.flatMap((document) =>
    document.id === undefined || CLOSED_DOCUMENT.has(document.separationStatus)
      ? []
      : [{ id: document.id, number: document.number, recipientName: document.recipientName }],
  )
  if (documents.length === 0) return null
  if (documents.length > 1) return { documents, header: null, stopId: stop.id }
  // O bloco é melhor esforço: sem leitor (ou com o leitor fora), o bloco mínimo do que a lista de paradas traz.
  const view = await input.stopCards
    ?.read({ companyId: actor.companyId, driverId: actor.driverId, stopId: stop.id })
    .catch(() => null)
  const card = view?.card ?? cardFromStopCandidate(stop)
  return {
    documents,
    header: describeStopCard(card, { volumesSuffix: ' para entregar' }).join('\n'),
    stopId: stop.id,
  }
}
