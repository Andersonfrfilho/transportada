/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import type { CargoArrivalSummary } from '../shared/cargoArrival.types'
import tableStyles from '../styles/cargoTable.module.css'
import { CargoOverdueBadge, CargoStatusBadge } from './CargoArrivalBadges.component'
import { CargoArrivalProgress } from './CargoArrivalProgress.component'

type CargoArrivalRowProps = Readonly<{
  arrival: CargoArrivalSummary
  canManage: boolean
  onOpen: (arrivalId: string) => void
  onSeparate: (arrivalId: string) => void
}>

function DueCell({ arrival }: Readonly<{ arrival: CargoArrivalSummary }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()
  return (
    <div className={tableStyles.dueCell}>
      <span>
        {arrival.separationDueAt === null
          ? t('badge.noDue')
          : formatMoment(arrival.separationDueAt)}
      </span>
      {arrival.isSeparationOverdue ? <CargoOverdueBadge /> : null}
    </div>
  )
}

/** "Abrir" leva ao detalhe do escritório; "Separar" leva à tela do celular — só com `trip.manage` e chegada aberta. */
export function CargoArrivalRow({
  arrival,
  canManage,
  onOpen,
  onSeparate,
}: CargoArrivalRowProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()

  return (
    <tr>
      <td>{arrival.contractorName}</td>
      <td>{formatMoment(arrival.arrivedAt)}</td>
      <td>{arrival.counts.total}</td>
      <td className={tableStyles.progressCell}>
        <CargoArrivalProgress counts={arrival.counts} />
      </td>
      <td>
        <DueCell arrival={arrival} />
      </td>
      <td>
        <CargoStatusBadge status={arrival.status} />
      </td>
      <td>
        <div className={tableStyles.rowActions}>
          <Button
            aria-label={t('table.openLabel', { name: arrival.contractorName })}
            onClick={() => onOpen(arrival.id)}
            type="button"
            variant="ghost"
          >
            <Icon name="eye" />
            {t('table.open')}
          </Button>
          {canManage && arrival.status === 'open' ? (
            <Button
              aria-label={t('table.separateLabel', { name: arrival.contractorName })}
              onClick={() => onSeparate(arrival.id)}
              type="button"
              variant="secondary"
            >
              <Icon name="check" />
              {t('table.separate')}
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}
