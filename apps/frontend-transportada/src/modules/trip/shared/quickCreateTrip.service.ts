/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A sequência da criação rápida: criar → vincular → reordenar → planejar. Pura sobre o cliente, para
 * o contrato provar a ordem das requisições e o que cada falha faz.
 *
 * ⚠️ **Depois que a viagem existe, nada aqui falha para quem chamou.** Os passos não são atômicos no
 * servidor, e um erro devolvido deixaria o botão "Criar viagem" ativo: o segundo clique criaria outra
 * viagem para a mesma carga, o vínculo falharia (nota já vinculada) e sobraria uma viagem vazia. O
 * operador é levado à viagem criada, que diz no detalhe o que ficou por fazer.
 */
import { resolveStopOrder, type AssemblyCityOrder } from './assemblyOrder.service'
import type { RouteChoice } from './routeGeometry.service'
import type { TripClient } from './tripClient.service'
import type { CreateTripBody, TripDetail } from './trip.types'

export type QuickCreateTripClient = Pick<
  TripClient,
  'createTrip' | 'getTrip' | 'linkTripDocumentsBatch' | 'planTripRoute' | 'reorderTripStops'
>

export type RunQuickCreateTripParams = Readonly<{
  cityOrder: AssemblyCityOrder
  client: QuickCreateTripClient
  createBody: CreateTripBody
  nfeDocumentIds: readonly string[]
  /** A rota que o mapa mostrou (spec 153). Ausente é o critério padrão do servidor. */
  routeChoice?: RouteChoice | undefined
}>

export async function runQuickCreateTrip(input: RunQuickCreateTripParams): Promise<TripDetail> {
  const trip = await input.client.createTrip(input.createBody)

  try {
    await completeQuickCreateTrip({ ...input, tripId: trip.id })
  } catch {
    /* a viagem existe: o operador segue para ela, e o detalhe oferece o que faltou */
  }

  return trip
}

async function completeQuickCreateTrip(
  input: RunQuickCreateTripParams & Readonly<{ tripId: string }>,
): Promise<void> {
  const { client, tripId } = input
  /**
   * Uma requisição para o maço inteiro. O laço de antes pagava uma ida ao servidor por nota, e
   * uma viagem de trezentas notas falhava no meio com a viagem já criada.
   */
  await client.linkTripDocumentsBatch({ nfeDocumentIds: input.nfeDocumentIds, tripId })
  await reorderByMap({ client, cityOrder: input.cityOrder, tripId })
  /**
   * ⚠️ **Planejar vem depois de reordenar.** Reordenar recongela a rota com o critério padrão, e
   * planejar antes gravava a escolha só para a reordenação sobrescrevê-la — além de medir a
   * assinatura sobre uma ordem que não é a do mapa (spec 153).
   */
  await client.planTripRoute({
    ...(input.routeChoice === undefined ? {} : { routeChoice: input.routeChoice }),
    tripId,
  })
}

/**
 * A ordem do mapa só pode ser aplicada **aqui**: as paradas nascem do endereço normalizado no
 * vínculo, e antes disso não existe id de parada para reordenar. Falha aqui não impede planejar — a
 * viagem sai com a ordem do vínculo, e a ordem se corrige no detalhe.
 */
async function reorderByMap(input: {
  readonly client: QuickCreateTripClient
  readonly cityOrder: AssemblyCityOrder
  readonly tripId: string
}): Promise<void> {
  try {
    const detail = await input.client.getTrip({ tripId: input.tripId })
    const stopIds = resolveStopOrder({ order: input.cityOrder, stops: detail.stops })
    if (stopIds.length > 1) {
      await input.client.reorderTripStops({ stopIds, tripId: input.tripId })
    }
  } catch {
    /* a ordem é conveniência: sem ela a viagem ainda precisa da rota planejada */
  }
}
