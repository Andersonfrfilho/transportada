/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueries } from '@tanstack/react-query'

import { getFleetClient } from '@/modules/fleet/hooks/useFleet.hook'

import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import {
  toDriverVehicleBinding,
  type DriverVehicleBinding,
} from '../shared/driverBoundVehicles.service'

/**
 * Teto de consultas de vínculo. O vínculo é por motorista e não há rota em lote, então a frota
 * grande deixa de adiantar todo mundo e volta a resolver só quem foi escolhido — o carro aparece um
 * instante depois, em vez de a tela disparar duzentas consultas ao abrir.
 */
const PREFETCH_CAP = 60

/**
 * O vínculo é buscado **antes** da escolha, e não depois: quem monta a viagem precisa ver de qual
 * caminhão é cada agregado para escolher. Resolver só o já escolhido deixava a lista sem o carro e
 * o campo de veículo vazio por segundos depois do clique — tempo suficiente para o operador
 * concluir que a tela não faz isso e escolher o veículo à mão.
 *
 * Um hook só para os dois modais de criação: eram dois caminhos, e só um deles adiantava.
 */
export function useDriverVehicleBindings(
  input: Readonly<{
    enabled: boolean
    selectableDriverIds: readonly string[]
    selectedDriverIds: readonly string[]
  }>,
): readonly DriverVehicleBinding[] {
  const queriedDriverIds =
    input.selectableDriverIds.length <= PREFETCH_CAP
      ? input.selectableDriverIds
      : input.selectedDriverIds

  const queries = useQueries({
    queries: queriedDriverIds.map((driverId) => ({
      enabled: input.enabled,
      queryFn: () => getFleetClient().listDriverVehicles({ driverId }),
      queryKey: [TRIP_QUERY_KEY, 'driver-vehicles', driverId],
    })),
  })

  return queriedDriverIds.flatMap((driverId, index) => {
    const links = queries[index]?.data
    return links === undefined ? [] : [toDriverVehicleBinding({ driverId, links })]
  })
}
