/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useCargoPreviewList } from '../hooks/useCargoPreviewList.hook'
import { hasCargoPreviewTableCriteria } from '../shared/cargoPreviewTable.service'
import styles from '../styles/cargoReceiving.module.css'
import { CargoPreviewFilterBar } from './CargoPreviewFilterBar.component'
import { CargoPreviewTable } from './CargoPreviewTable.component'
import { CargoPreviewUploadPanel } from './CargoPreviewUploadPanel.component'

type CargoPreviewListPanelProps = Readonly<{
  /** `trip.manage`: quem só lê vê a lista e abre o detalhe, mas não envia planilha nem age nas linhas. */
  canManage: boolean
}>

/** A lista de prévias: o envio no alto, depois contratante, arquivo, dia planejado, linhas e situação. */
export function CargoPreviewListPanel({ canManage }: CargoPreviewListPanelProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const list = useCargoPreviewList()
  const isFiltered = hasCargoPreviewTableCriteria(list.table.state)

  return (
    <>
      {canManage ? <CargoPreviewUploadPanel /> : null}
      <CargoPreviewFilterBar
        contractors={list.contractors}
        loadedCount={list.loadedCount}
        shownCount={list.visible.length}
        table={list.table}
      />

      {list.isLoading ? (
        <SkeletonGroup label={t('preview.list.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : list.errorCode !== undefined ? (
        <p className={styles.error} role="alert">
          {t('preview.list.error', { code: list.errorCode })}
        </p>
      ) : list.visible.length === 0 ? (
        <p className={styles.hint}>
          {isFiltered ? t('preview.list.emptyFiltered') : t('preview.list.empty')}
        </p>
      ) : null}

      {list.visible.length === 0 ? null : (
        <CargoPreviewTable onOpen={list.openDetail} previews={list.visible} table={list.table} />
      )}

      {list.hasNextPage ? (
        <Button disabled={list.isLoadingMore} onClick={list.loadMore} type="button" variant="ghost">
          <Icon name="page-next" />
          {t('preview.list.loadMore')}
        </Button>
      ) : null}
    </>
  )
}
