/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { getRouteSuggestionClient } from '@/modules/routing/hooks/useRouteSuggestion.hook'
import type { RouteSuggestionClient } from '@/modules/routing/shared/routeSuggestionClient.service'

import type { AssemblyCityOrder } from '../shared/assemblyOrder.service'
import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import { documentIdsOf, toCityOrderFromSolver } from '../shared/solverCityOrder.service'
import { resolveRouteFinish, type RouteFinish } from '../shared/routeSchedule.service'

/** Mesmo ritmo do painel da viagem: o worker resolve, e a tela pergunta de novo. */
const POLL_INTERVAL_MILLISECONDS = 2_000
/** O solver não é instantâneo, mas diálogo que espera para sempre é diálogo travado. */
const TIMEOUT_MILLISECONDS = 90_000
const SETTLED = new Set(['accepted', 'failed', 'ready', 'rejected', 'stale'])

export type SolverOrderState = 'erro' | 'ocioso' | 'pedindo'

export type SolverCityOrderController = Readonly<{
  /** Por que não dá para pedir agora — `null` quando dá. É isto que a tela imprime no botão. */
  blockReason: 'sem-paradas' | 'sem-veiculo' | null
  errorCode: null | string
  /** O término previsto do roteiro, do último `estimatedArrivalAt`. `null` antes do primeiro pedido. */
  finish: RouteFinish | null
  request: () => Promise<void>
  state: SolverOrderState
}>

/**
 * "Melhor rota" no diálogo de montagem: pergunta ao **roteirizador do produto**, não a uma segunda
 * heurística.
 *
 * ⚠️ **Ele nunca aceita a sugestão.** `POST .../accept` cria viagens de verdade, e este diálogo cria
 * a viagem por conta própria logo depois (`createTrip → linkTripDocumentsBatch → planTripRoute →
 * reorderTripStops`). Aceitar aqui produziria **duas** viagens para a mesma carga. O que se
 * aproveita é a ordem; a decisão continua sendo do operador, no botão "Criar viagem".
 *
 * ⚠️ **Exige veículo escolhido**, porque o contrato da rota exige (`vehicles` tem mínimo 1) — e com
 * razão: capacidade e cubagem mudam o roteiro. Sem veículo o botão diz isso, em vez de falhar com
 * 400 depois do clique.
 *
 * ⚠️ A linha em `route_suggestions` fica em `ready` e **não é decidida**. É lixo declarado: não há
 * status para "li a ordem e não quis as viagens", e inventar um `rejected` mentiria na trilha —
 * a sugestão foi usada. Fechar essas linhas é trabalho de rotina agendada, com spec própria.
 */
export function useSolverCityOrder(input: {
  readonly client?: RouteSuggestionClient
  readonly onOrderChange: (order: AssemblyCityOrder) => void
  readonly order: AssemblyCityOrder
  readonly points: readonly AssemblyMapPoint[]
  readonly vehicleId: null | string
}): SolverCityOrderController {
  const [state, setState] = useState<SolverOrderState>('ocioso')
  const [errorCode, setErrorCode] = useState<null | string>(null)
  const [finish, setFinish] = useState<RouteFinish | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  /** Refs para o pedido em voo não fechar sobre paradas que o operador já mudou. */
  const latest = useRef(input)
  latest.current = input

  const blockReason = resolveBlockReason(input)

  const request = useCallback(async () => {
    const { client, onOrderChange, order, points, vehicleId } = latest.current
    if (resolveBlockReason(latest.current) !== null || vehicleId === null) return

    setState('pedindo')
    setErrorCode(null)

    const routeClient = client ?? getRouteSuggestionClient()
    try {
      const criada = await routeClient.createMultiVehicle({
        nfeDocumentIds: documentIdsOf(points),
        vehicles: [{ vehicleId }],
      })

      const pronta = await pollUntilSettled({
        client: routeClient,
        isCancelled: () => cancelled.current,
        suggestionId: criada.id,
      })
      if (pronta === null || cancelled.current) return

      if (pronta.status !== 'ready') {
        setState('erro')
        setErrorCode(pronta.errorCode ?? pronta.status)
        return
      }

      onOrderChange(toCityOrderFromSolver({ order, stops: pronta.stops }))
      setFinish(
        resolveRouteFinish({
          distanceMetres: pronta.estimatedDistanceMeters,
          durationSeconds: pronta.estimatedDurationSeconds,
          stops: pronta.stops,
        }),
      )
      setState('ocioso')
    } catch (error) {
      if (cancelled.current) return
      setState('erro')
      setErrorCode(error instanceof Error ? error.message : 'desconhecido')
    }
  }, [])

  return { blockReason, errorCode, finish, request, state }
}

function resolveBlockReason(input: {
  readonly points: readonly AssemblyMapPoint[]
  readonly vehicleId: null | string
}): SolverCityOrderController['blockReason'] {
  if (input.vehicleId === null || input.vehicleId === '') return 'sem-veiculo'
  /** Com uma parada não há o que ordenar, e o pedido gastaria uma rodada do solver por nada. */
  if (input.points.length < 2) return 'sem-paradas'
  return null
}

/**
 * ⚠️ **Tempo esgotado devolve `null`, não erro.** Sem `ROUTING_MATRIX_URL` no worker o consumidor
 * nem sobe e a sugestão fica `queued` para sempre — esperar indefinidamente travaria o diálogo com
 * a carga já escolhida.
 */
async function pollUntilSettled(input: {
  readonly client: RouteSuggestionClient
  readonly isCancelled: () => boolean
  readonly suggestionId: string
}) {
  const limite = Date.now() + TIMEOUT_MILLISECONDS
  while (Date.now() < limite) {
    if (input.isCancelled()) return null
    const atual = await input.client.readMultiVehicle({ suggestionId: input.suggestionId })
    if (SETTLED.has(atual.status)) return atual
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MILLISECONDS))
  }
  return null
}
