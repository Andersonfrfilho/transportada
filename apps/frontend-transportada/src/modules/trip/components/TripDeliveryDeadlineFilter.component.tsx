/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'

import type { TripDeliveryDeadlineScope } from '../hooks/useTripDeliveryDeadlineScope.hook'
import { DELIVERY_DEADLINE_FILTER_VALUES } from '../shared/tripDeliveryDeadline.constant'
import { normalizeDeliveryDeadlineValues } from '../shared/tripDeliveryDeadlineFilter.service'
import styles from '../styles/tripDeliveryDeadline.module.css'

type TripDeliveryDeadlineFilterProps = Readonly<{
  scope: TripDeliveryDeadlineScope
}>

/**
 * Spec 236 P2: "vencidas / vencem hoje" na lista de notas da viagem. Seleção múltipla com a contagem de cada
 * opção; "limpar filtros" só existe com filtro ativo. Filtrar só escolhe o que se mostra: a rota e a ordem das
 * paradas não mudam.
 */
export function TripDeliveryDeadlineFilter({ scope }: TripDeliveryDeadlineFilterProps) {
  const { t } = useTranslation('trip')
  if (!scope.isOffered) return null

  const options: readonly MultiSelectOption[] = DELIVERY_DEADLINE_FILTER_VALUES.map((value) => ({
    label: t('deadlineFilter.optionWithCount', {
      count: scope.counts[value],
      label: t(`deadlineFilter.option.${value}`),
    }),
    value,
  }))

  return (
    <section className={styles.deadlineFilter} data-part="delivery-deadline-filter">
      <div className={styles.deadlineFilterField}>
        <MultiSelect
          ariaLabel={t('deadlineFilter.ariaLabel')}
          clearAllLabel={t('deadlineFilter.clearAll')}
          emptyLabel={t('deadlineFilter.empty')}
          onChange={(values) => scope.filter.setValues(normalizeDeliveryDeadlineValues(values))}
          options={options}
          placeholder={t('deadlineFilter.placeholder')}
          removeLabel={t('deadlineFilter.remove')}
          searchPlaceholder={t('deadlineFilter.searchPlaceholder')}
          summaryLabel={(count) => t('deadlineFilter.summary', { count })}
          values={scope.filter.values}
        />
      </div>
      {scope.hasFilter ? (
        <>
          <p aria-live="polite" className={styles.deadlineFilterCount}>
            {t('deadlineFilter.shownCount', { count: scope.totalCount, shown: scope.shownCount })}
          </p>
          <Button onClick={scope.filter.clear} type="button" variant="ghost">
            <Icon name="filter-clear" />
            {t('deadlineFilter.clear')}
          </Button>
        </>
      ) : null}
    </section>
  )
}
