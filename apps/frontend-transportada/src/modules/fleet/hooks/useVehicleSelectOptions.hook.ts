import { useTranslation } from 'react-i18next'

import type { SelectOption } from '@/components/ui/select'

import type { FleetVehicleDetail } from '../shared/fleet.types'
import {
  buildVehicleOptionDescription,
  resolveVehicleColorSwatch,
} from '../shared/vehicleOption.service'

/**
 * O vocabulário da frota (propriedade, cor) mora no `fleet`, e quem escolhe veículo mora noutros
 * módulos: copiar as chaves para cada `*.locale.json` faria "Próprio da transportadora" ter duas
 * grafias no mesmo produto.
 */
export function useVehicleSelectOptions(
  vehicles: readonly FleetVehicleDetail[],
): readonly SelectOption[] {
  const { t } = useTranslation('fleet')

  return vehicles.map((vehicle) => {
    const swatch = resolveVehicleColorSwatch(vehicle.color)
    const description = buildVehicleOptionDescription({
      brand: vehicle.brand,
      colorLabel: swatch === undefined ? '' : t(`colorOption.${vehicle.color}`),
      model: vehicle.model,
      ownershipLabel: t(`ownershipOption.${vehicle.ownership}`),
    })

    return {
      description,
      label: `${vehicle.plate} · ${vehicle.state}`,
      value: vehicle.id,
      ...(swatch === undefined ? {} : { swatch }),
    }
  })
}
