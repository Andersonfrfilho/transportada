/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CargoPreviewDetailController } from '../hooks/useCargoPreviewDetail.hook'
import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import type { CargoPreviewProposalController } from '../hooks/useCargoPreviewProposal.hook'
import type { CargoPreviewDetail } from '../shared/cargoPreview.types'
import type { CargoPreviewSession } from '../shared/cargoPreviewTripDraft.types'
import { hasCargoPreviewDetailFilters } from '../shared/cargoPreviewDetailView.service'
import styles from '../styles/cargoReceiving.module.css'
import { CargoPreviewDetailFilters } from './CargoPreviewDetailFilters.component'
import { CargoPreviewDetailHeader } from './CargoPreviewDetailHeader.component'
import { CargoPreviewProposalSection } from './CargoPreviewProposalSection.component'
import { CargoPreviewRouteSection } from './CargoPreviewRouteSection.component'
import { CargoPreviewTripDraftsSection } from './CargoPreviewTripDraftsSection.component'

type CargoPreviewDetailContentProps = Readonly<{
  actions: CargoPreviewItemActionsController
  detail: CargoPreviewDetailController
  header: CargoPreviewDetail
  proposal: CargoPreviewProposalController
  session: CargoPreviewSession
}>

/** Cabeçalho, proposta de chegada, recomendação de viagens, filtros e os grupos por roteiro. */
export function CargoPreviewDetailContent({
  actions,
  detail,
  header,
  proposal,
  session,
}: CargoPreviewDetailContentProps): JSX.Element {
  const { canManage } = session
  const { t } = useTranslation('cargoReceiving')
  const isFiltered = hasCargoPreviewDetailFilters(detail.filters.filters)

  return (
    <>
      <CargoPreviewDetailHeader header={header} />
      <CargoPreviewProposalSection canManage={canManage} header={header} proposal={proposal} />
      <CargoPreviewTripDraftsSection
        onShowState={(state) => detail.filters.setStates([state])}
        previewId={header.id}
        session={session}
        status={header.status}
      />
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
