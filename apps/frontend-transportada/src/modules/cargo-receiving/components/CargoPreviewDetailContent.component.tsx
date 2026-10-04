/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CargoPreviewDetailController } from '../hooks/useCargoPreviewDetail.hook'
import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import type { CargoPreviewProposalController } from '../hooks/useCargoPreviewProposal.hook'
import type { CargoPreviewDetail } from '../shared/cargoPreview.types'
import { hasCargoPreviewDetailFilters } from '../shared/cargoPreviewDetailView.service'
import styles from '../styles/cargoReceiving.module.css'
import { CargoPreviewDetailFilters } from './CargoPreviewDetailFilters.component'
import { CargoPreviewDetailHeader } from './CargoPreviewDetailHeader.component'
import { CargoPreviewProposalSection } from './CargoPreviewProposalSection.component'
import { CargoPreviewRouteSection } from './CargoPreviewRouteSection.component'

type CargoPreviewDetailContentProps = Readonly<{
  actions: CargoPreviewItemActionsController
  canManage: boolean
  detail: CargoPreviewDetailController
  header: CargoPreviewDetail
  proposal: CargoPreviewProposalController
}>

/** Cabeçalho, proposta de chegada, filtros e os grupos por roteiro — o que a prévia lida mostra. */
export function CargoPreviewDetailContent({
  actions,
  canManage,
  detail,
  header,
  proposal,
}: CargoPreviewDetailContentProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const isFiltered = hasCargoPreviewDetailFilters(detail.filters.filters)

  return (
    <>
      <CargoPreviewDetailHeader header={header} />
      <CargoPreviewProposalSection canManage={canManage} header={header} proposal={proposal} />
      <CargoPreviewDetailFilters controller={detail.filters} routes={header.routes} />
      {detail.sections.length === 0 ? (
        <p className={styles.hint}>
          {isFiltered ? t('preview.detail.emptyFiltered') : t('preview.detail.empty')}
        </p>
      ) : null}
      {detail.sections.map((section) => (
        <CargoPreviewRouteSection
          actions={actions}
          canManage={canManage}
          contractorId={header.contractorId}
          items={detail.loadedItems}
          key={section.routeName ?? ''}
          section={section}
        />
      ))}
      {detail.hasNextPage ? (
        <Button
          disabled={detail.isLoadingMore}
          onClick={detail.loadMore}
          type="button"
          variant="ghost"
        >
          <Icon name="page-next" />
          {t('preview.detail.loadMore')}
        </Button>
      ) : null}
    </>
  )
}
