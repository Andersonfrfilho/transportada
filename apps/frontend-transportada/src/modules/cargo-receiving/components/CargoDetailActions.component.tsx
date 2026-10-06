/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CargoTransitionTarget } from '../shared/cargoArrival.types'
import { validateRouteName } from '../shared/cargoArrivalForm.validation'
import { CARGO_ARRIVAL_LIMITS } from '../shared/cargoReceiving.constant'
import styles from '../styles/cargoReceiving.module.css'
import detailStyles from '../styles/cargoDetail.module.css'
import { CargoTextField } from './CargoTextField.component'

type CargoDetailActionsProps = Readonly<{
  isWorking: boolean
  onAssignRoute: (routeName: string) => void
  onClearSelection: () => void
  onSetStatus: (to: CargoTransitionTarget) => void
  selectedCount: number
}>

/** A barra que aparece com nota selecionada: rota, receber e separar em lote (até 300 por vez). */
export function CargoDetailActions({
  isWorking,
  onAssignRoute,
  onClearSelection,
  onSetStatus,
  selectedCount,
}: CargoDetailActionsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const [routeName, setRouteName] = useState('')
  const [hasTriedRoute, setHasTriedRoute] = useState(false)
  const issue = hasTriedRoute ? validateRouteName(routeName) : undefined

  function handleApplyRoute(): void {
    setHasTriedRoute(true)
    if (validateRouteName(routeName) !== undefined) return
    onAssignRoute(routeName)
  }

  return (
    <section className={detailStyles.selectionBar}>
      <p className={styles.counter}>{t('detail.selected', { count: selectedCount })}</p>
      <div className={detailStyles.routeRow}>
        <CargoTextField
          fieldName="routeName"
          hint={t('actions.routeHint')}
          issue={issue}
          label={t('actions.routeLabel', { max: CARGO_ARRIVAL_LIMITS.routeNameMaxLength })}
          onChange={(value) => {
            setRouteName(value)
            setHasTriedRoute(false)
          }}
          value={routeName}
        />
        <div className={styles.actions}>
          <Button disabled={isWorking} onClick={handleApplyRoute} type="button" variant="secondary">
            <Icon name="edit" />
            {t('actions.applyRoute')}
          </Button>
        </div>
      </div>
      <div className={styles.actions}>
        <Button disabled={isWorking} onClick={() => onSetStatus('received')} type="button">
          <Icon name="check" />
          {t('actions.markReceived')}
        </Button>
        <Button disabled={isWorking} onClick={() => onSetStatus('separated')} type="button">
          <Icon name="check" />
          {t('actions.markSeparated')}
        </Button>
        <Button onClick={onClearSelection} type="button" variant="ghost">
          <Icon name="close" />
          {t('detail.clearSelection')}
        </Button>
      </div>
    </section>
  )
}
