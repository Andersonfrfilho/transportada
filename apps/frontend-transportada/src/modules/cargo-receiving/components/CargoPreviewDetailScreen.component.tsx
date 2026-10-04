/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useCargoPreviewDetail } from '../hooks/useCargoPreviewDetail.hook'
import { useCargoPreviewItemActions } from '../hooks/useCargoPreviewItemActions.hook'
import { useCargoPreviewProposal } from '../hooks/useCargoPreviewProposal.hook'
import { navigateToCargoPreviews } from '../shared/cargoReceivingRoute.service'
import styles from '../styles/cargoReceiving.module.css'
import { CargoPreviewDetailContent } from './CargoPreviewDetailContent.component'
import { CargoReceivingShell } from './CargoReceivingShell.component'

type CargoPreviewDetailScreenProps = Readonly<{
  canManage: boolean
  previewId: string
}>

/** O detalhe de uma prévia: o que chegou, o que já tem nota, o que espera o XML e o que a planilha errou. */
export function CargoPreviewDetailScreen({
  canManage,
  previewId,
}: CargoPreviewDetailScreenProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  const detail = useCargoPreviewDetail(previewId)
  const actions = useCargoPreviewItemActions(previewId)
  const proposal = useCargoPreviewProposal({ items: detail.loadedItems, previewId })
  const { header } = detail

  return (
    <CargoReceivingShell
      actions={
        <Button onClick={() => navigateToCargoPreviews(navigator)} type="button" variant="ghost">
          <Icon name="chevron-left" />
          {t('preview.detail.back')}
        </Button>
      }
      title={
        header === undefined
          ? t('preview.detail.title', { name: '…' })
          : t('preview.detail.title', {
              name: header.contractorName ?? t('preview.unknownContractor'),
            })
      }
    >
      {detail.isLoading ? (
        <SkeletonGroup label={t('preview.detail.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : detail.errorCode !== undefined || header === undefined ? (
        <p className={styles.error} role="alert">
          {t([`preview.errors.${detail.errorCode}`, 'preview.detail.error'], {
            code: detail.errorCode,
          })}
        </p>
      ) : (
        <CargoPreviewDetailContent
          actions={actions}
          canManage={canManage}
          detail={detail}
          header={header}
          proposal={proposal}
        />
      )}
    </CargoReceivingShell>
  )
}
