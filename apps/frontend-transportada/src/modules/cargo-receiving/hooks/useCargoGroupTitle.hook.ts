/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { CargoArrivalGroup } from '../shared/cargoArrival.types'
import { resolveGroupCityLabel } from '../shared/cargoArrivalGroups.service'

/** "Rota · Cidade", com o nome que a API devolveu; rota ou cidade ausente tem texto próprio, nunca vazio. */
export function useCargoGroupTitle(): (group: CargoArrivalGroup) => string {
  const { t } = useTranslation('cargoReceiving')
  return (group) =>
    t('group.title', {
      city: resolveGroupCityLabel(group) ?? t('group.noCity'),
      route: group.routeName ?? t('group.noRoute'),
    })
}
