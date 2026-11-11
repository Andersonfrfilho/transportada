/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  useCanhotoPickupsQuery,
  useScheduleCanhotoPickupMutation,
  useUnscheduleCanhotoPickupMutation,
} from '../queries/useCanhotoPickups.query'
import { CanhotoPickupRequestError } from '../shared/canhotoPickupClient.service'
import { splitCanhotoPickupsForTrip, type CanhotoPickup } from '../shared/canhotoPickup.service'
import styles from '../styles/canhotoPickup.module.css'
import { CanhotoPickupFlag } from './CanhotoPickupFlag.component'

type TripCanhotoPickupsProps = Readonly<{
  /** `trip.report-on-behalf`: a mesma permissão das rotas da T3. Sem ela o painel nem consulta. */
  canSchedule: boolean
  /** Viagem concluída ou cancelada não recebe coleta (`409 CANHOTO_PICKUP_TRIP_CLOSED`). */
  isTripOpen: boolean
  tripId: string
}>

function resolveErrorText(error: unknown, t: (key: string) => string): string {
  const code = error instanceof CanhotoPickupRequestError ? error.message : 'REQUEST_FAILED'
  const key = `canhotoPickup.errors.${code}`
  const text = t(key)

  return text === key ? t('canhotoPickup.errors.REQUEST_FAILED') : text
}

function PickupRow(
  props: Readonly<{
    action: Readonly<{ icon: 'add' | 'remove'; label: string; onClick: () => void }> | null
    isBusy: boolean
    pickup: CanhotoPickup
  }>,
) {
  const { t } = useTranslation('trip')
  const { pickup } = props

  return (
    <li className={styles.row}>
      <div className={styles.rowIdentity}>
        <span className={styles.rowTitle}>
          {pickup.documentNumber === null
            ? t('canhotoPickup.noDocument')
            : t('canhotoPickup.document', { number: pickup.documentNumber })}
        </span>
        <span className={styles.rowMeta}>
          {pickup.originStopLabel ?? t('canhotoPickup.noOriginStop')}
        </span>
      </div>
      <CanhotoPickupFlag variant="pickup" />
      {props.action === null ? null : (
        <Button
          disabled={props.isBusy}
          onClick={props.action.onClick}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name={props.action.icon} />
          {props.action.label}
        </Button>
      )}
    </li>
  )
}

/**
 * Spec 321 T5 (RF4, D7): o escritório encaixa a coleta do canhoto retido na viagem de outro motorista e a
 * desencaixa. A coleta **não** é nota da viagem: peso e dimensão ficam fora da carga (D4c), e o painel não
 * decide nada disso — só pede à API e relê. Sem coleta aberta para mostrar, o painel some.
 */
export function TripCanhotoPickups({ canSchedule, isTripOpen, tripId }: TripCanhotoPickupsProps) {
  const { t } = useTranslation('trip')
  const query = useCanhotoPickupsQuery({ enabled: canSchedule })
  const scheduleMutation = useScheduleCanhotoPickupMutation()
  const unscheduleMutation = useUnscheduleCanhotoPickupMutation()
  if (!canSchedule || query.data === undefined) return null

  const { available, scheduled } = splitCanhotoPickupsForTrip({ pickups: query.data, tripId })
  const offered = isTripOpen ? available : []
  if (scheduled.length === 0 && offered.length === 0) return null

  const isBusy = scheduleMutation.isPending || unscheduleMutation.isPending
  const failure = scheduleMutation.error ?? unscheduleMutation.error

  return (
    <section aria-labelledby="trip-canhoto-pickups-title" className={styles.panel}>
      <header className={styles.header}>
        <h3 id="trip-canhoto-pickups-title" tabIndex={-1}>
          {t('canhotoPickup.title')}
        </h3>
        <p className={styles.hint}>{t('canhotoPickup.hint')}</p>
      </header>
      {scheduled.length === 0 ? null : (
        <ul aria-label={t('canhotoPickup.scheduledList')} className={styles.list}>
          {scheduled.map((pickup) => (
            <PickupRow
              action={{
                icon: 'remove',
                label: t('canhotoPickup.unschedule'),
                onClick: () => unscheduleMutation.mutate(pickup.id),
              }}
              isBusy={isBusy}
              key={pickup.id}
              pickup={pickup}
            />
          ))}
        </ul>
      )}
      {offered.length === 0 ? null : (
        <>
          <p className={styles.subtitle}>{t('canhotoPickup.availableTitle')}</p>
          <ul aria-label={t('canhotoPickup.availableList')} className={styles.list}>
            {offered.map((pickup) => (
              <PickupRow
                action={{
                  icon: 'add',
                  label: t('canhotoPickup.schedule'),
                  onClick: () => scheduleMutation.mutate({ pickupId: pickup.id, tripId }),
                }}
                isBusy={isBusy}
                key={pickup.id}
                pickup={pickup}
              />
            ))}
          </ul>
        </>
      )}
      {failure === null ? null : (
        <p className={styles.error} role="alert">
          {resolveErrorText(failure, t)}
        </p>
      )}
    </section>
  )
}
