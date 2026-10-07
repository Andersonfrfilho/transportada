/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'
import type { CargoArrivalDetail } from '../shared/cargoArrival.types'
import { resolveSeparationProgress } from '../shared/cargoSeparationProgress.service'
import styles from '../styles/cargoSeparation.module.css'
import { CargoArrivalProgress } from './CargoArrivalProgress.component'
import { CargoReturnCountFacts } from './CargoReturnCountFacts.component'

type SeparationHeaderProps = Readonly<{
  arrival: CargoArrivalDetail
  onOpenList: () => void
  onOpenOffice: () => void
}>

/**
 * O cabeçalho compacto do celular: quem chegou, quanto falta separar e até quando. O progresso conta só as notas que
 * ainda se separam (as a devolver e as devolvidas ficam de fora e aparecem ao lado): 9 separadas + 1 devolvida é
 * completo, não 90%.
 */
export function SeparationHeader({
  arrival,
  onOpenList,
  onOpenOffice,
}: SeparationHeaderProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()
  const { returns } = useCargoOccurrence()
  const progress = resolveSeparationProgress({
    documents: arrival.groups.flatMap((group) => group.documents),
    returns,
  })

  return (
    <header className={styles.top}>
      <div className={styles.topRow}>
        <Button onClick={onOpenList} type="button" variant="ghost">
          <Icon name="chevron-left" />
          {t('separation.back')}
        </Button>
        <Button onClick={onOpenOffice} type="button" variant="ghost">
          <Icon name="eye" />
          {t('separation.openOffice')}
        </Button>
      </div>
      <p className={styles.kicker}>{t('separation.title')}</p>
      <h1 className={styles.title}>{arrival.contractorName}</h1>
      <div className={styles.badges}>
        <span
          className={[styles.badge, arrival.status === 'open' ? styles.badgeOn : '']
            .join(' ')
            .trim()}
        >
          {t(`status.${arrival.status}`)}
        </span>
        {arrival.isSeparationOverdue ? (
          <span className={[styles.badge, styles.badgeAlert].join(' ')}>{t('badge.overdue')}</span>
        ) : null}
      </div>
      <ul className={styles.facts}>
        <li>
          {arrival.separationDueAt === null
            ? t('facts.noDueAt')
            : t('facts.dueAt', { date: formatMoment(arrival.separationDueAt) })}
        </li>
        {arrival.reference === null ? null : (
          <li>{t('facts.reference', { reference: arrival.reference })}</li>
        )}
        <CargoReturnCountFacts />
      </ul>
      <CargoArrivalProgress counts={{ separated: progress.done, total: progress.total }} />
    </header>
  )
}
