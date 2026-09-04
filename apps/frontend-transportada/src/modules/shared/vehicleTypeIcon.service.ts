/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { IconName } from '@/components/ui/icon'

import type { VehicleType } from './vehicleType.constant'

/**
 * Spec 075 RF5: o desenho do tipo de veículo.
 *
 * ⚠️ **Do design system, não do módulo.** `<svg>` cru fora de `components/ui` é proibido e há
 * contrato guardando (`test/design-system/icon.contract.ts`): o ícone herda `currentColor` e escala
 * pelo token, e é isso que o faz funcionar em lista, em seletor e em estado desabilitado sem três
 * versões do mesmo desenho.
 *
 * O mapa é **total** por construção — `Record<VehicleType, IconName>` não compila sem todos os
 * tipos —, então tipo novo no catálogo não passa sem desenho.
 */
export const VEHICLE_TYPE_ICONS: Record<VehicleType, IconName> = {
  car: 'vehicle-car',
  motorcycle: 'vehicle-motorcycle',
  other: 'vehicle-other',
  three_quarter: 'vehicle-three-quarter',
  toco: 'vehicle-toco',
  tractor_unit: 'vehicle-tractor-unit',
  truck: 'vehicle-truck',
  utility: 'vehicle-utility',
  van: 'vehicle-van',
  vuc: 'vehicle-vuc',
}
