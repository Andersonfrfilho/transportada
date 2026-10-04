/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'

import type { CargoPreviewDetailFiltersController } from '../hooks/useCargoPreviewDetailFilters.hook'
import { CARGO_PREVIEW_ITEM_STATES } from '../shared/cargoPreview.constant'
import type { CargoPreviewItemState, CargoPreviewRouteGroup } from '../shared/cargoPreview.types'
import { hasCargoPreviewDetailFilters } from '../shared/cargoPreviewDetailView.service'
import styles from '../styles/cargoReceiving.module.css'

type CargoPreviewDetailFiltersProps = Readonly<{
  controller: CargoPreviewDetailFiltersController
  routes: readonly CargoPreviewRouteGroup[]
}>

function isItemState(value: string): value is CargoPreviewItemState {
  return CARGO_PREVIEW_ITEM_STATES.some((state) => state === value)
}

/** Situação do item e roteiro com seleção múltipla; "limpar filtros" só existe com filtro aplicado. */
export function CargoPreviewDetailFilters({
  controller,
  routes,
}: CargoPreviewDetailFiltersProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <section className={styles.toolbar}>
      <div className={styles.field}>
        <MultiSelect
          ariaLabel={t('preview.filters.itemState')}
          clearAllLabel={t('filters.clearAll')}
          emptyLabel={t('filters.statusEmpty')}
          onChange={(values) => controller.setStates(values.filter(isItemState))}
          options={CARGO_PREVIEW_ITEM_STATES.map((state) => ({
            label: t(`preview.itemState.${state}`),
            value: state,
          }))}
          placeholder={t('preview.filters.itemStatePlaceholder')}
          removeLabel={t('preview.filters.itemStateRemove')}
          searchPlaceholder={t('filters.statusSearch')}
          summaryLabel={(count) => t('preview.filters.itemStateSummary', { count })}
          values={controller.filters.states}
        />
      </div>
      <div className={styles.field}>
        <MultiSelect
          ariaLabel={t('preview.filters.route')}
          clearAllLabel={t('filters.clearAll')}
          emptyLabel={t('preview.filters.routeEmpty')}
          onChange={controller.setRouteNames}
          options={routes.map((route) => ({ label: route.routeName, value: route.routeName }))}
          placeholder={t('preview.filters.routePlaceholder')}
          removeLabel={t('preview.filters.routeRemove')}
          searchPlaceholder={t('preview.filters.routeSearch')}
          summaryLabel={(count) => t('preview.filters.routeSummary', { count })}
          values={controller.filters.routeNames}
        />
      </div>
      {hasCargoPreviewDetailFilters(controller.filters) ? (
        <Button onClick={controller.clear} type="button" variant="ghost">
          <Icon name="filter-clear" />
          {t('filters.clear')}
        </Button>
      ) : null}
    </section>
  )
}
