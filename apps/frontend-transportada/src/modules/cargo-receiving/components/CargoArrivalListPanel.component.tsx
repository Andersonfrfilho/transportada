/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useCargoArrivalList } from '../hooks/useCargoArrivalList.hook'
import { hasCargoArrivalTableCriteria } from '../shared/cargoArrivalTable.service'
import styles from '../styles/cargoReceiving.module.css'
import { CargoArrivalFilterBar } from './CargoArrivalFilterBar.component'
import { CargoArrivalTable } from './CargoArrivalTable.component'

type CargoArrivalListPanelProps = Readonly<{
  /** `trip.manage`: quem só lê vê a lista e abre o detalhe, mas não registra nem separa. */
  canManage: boolean
}>

/** A lista de chegadas do escritório: contratante, notas, progresso, prazo e situação. */
export function CargoArrivalListPanel({ canManage }: CargoArrivalListPanelProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const list = useCargoArrivalList()
  const isFiltered = hasCargoArrivalTableCriteria(list.table.state)

  return (
    <>
      {canManage ? (
        <div className={styles.actions}>
          <Button onClick={list.openRegister} type="button">
            <Icon name="add" />
            {t('list.register')}
          </Button>
        </div>
      ) : null}
      <CargoArrivalFilterBar
        contractors={list.contractors}
        loadedCount={list.loadedCount}
        shownCount={list.visible.length}
        table={list.table}
      />

      {list.isLoading ? (
        <SkeletonGroup label={t('list.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : list.errorCode !== undefined ? (
        <p className={styles.error} role="alert">
          {t('list.error', { code: list.errorCode })}
        </p>
      ) : list.visible.length === 0 ? (
        <p className={styles.hint}>{isFiltered ? t('list.emptyFiltered') : t('list.empty')}</p>
      ) : null}

      {list.visible.length === 0 ? null : (
        <CargoArrivalTable
          arrivals={list.visible}
          canManage={canManage}
          onOpen={list.openDetail}
          onSeparate={list.openSeparation}
          table={list.table}
        />
      )}

      {list.hasNextPage ? (
        <Button disabled={list.isLoadingMore} onClick={list.loadMore} type="button" variant="ghost">
          <Icon name="page-next" />
          {t('list.loadMore')}
        </Button>
      ) : null}
    </>
  )
}
