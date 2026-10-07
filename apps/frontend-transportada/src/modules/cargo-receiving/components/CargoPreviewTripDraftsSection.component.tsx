/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useCargoPreviewTripDrafts } from '../hooks/useCargoPreviewTripDrafts.hook'
import type { CargoPreviewItemState, CargoPreviewStatus } from '../shared/cargoPreview.types'
import type { CargoPreviewSession } from '../shared/cargoPreviewTripDraft.types'
import { resolvePreviewErrorKeys } from '../shared/cargoPreviewRefusal.service'
import detailStyles from '../styles/cargoPreviewDetail.module.css'
import receivingStyles from '../styles/cargoReceiving.module.css'
import styles from '../styles/cargoTripDraft.module.css'
import { CargoTripDraftBoard } from './CargoTripDraftBoard.component'

type CargoPreviewTripDraftsSectionProps = Readonly<{
  onShowState: (state: CargoPreviewItemState) => void
  previewId: string
  session: CargoPreviewSession
  status: CargoPreviewStatus
}>

/**
 * RF7: "Recomendar viagens" no detalhe da prévia. Quem lê vê as duas visões; as ações que criam viagem pedem
 * `trip.manage`, e NADA vira viagem sem passar pelo fluxo que já existe (criação ou aceite do roteirizador).
 * A prévia que ainda não foi lida explica em vez de oferecer um botão que não teria o que mostrar.
 */
export function CargoPreviewTripDraftsSection({
  onShowState,
  previewId,
  session,
  status,
}: CargoPreviewTripDraftsSectionProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const controller = useCargoPreviewTripDrafts({ previewId })

  if (status !== 'ready') {
    return (
      <p className={receivingStyles.hint} data-trip-drafts-notice="">
        {status === 'failed' ? t('preview.drafts.failed') : t('preview.drafts.notReady')}
      </p>
    )
  }
  if (!controller.isOpen) {
    return (
      <div className={receivingStyles.actions}>
        <Button onClick={controller.open} type="button" variant="secondary">
          <Icon name="truck" />
          {t('preview.drafts.open')}
        </Button>
      </div>
    )
  }

  return (
    <section className={styles.drafts} data-trip-drafts="">
      <header className={styles.draftsHeader}>
        <div>
          <h2>{t('preview.drafts.title')}</h2>
          <p className={detailStyles.secondary}>{t('preview.drafts.hint')}</p>
        </div>
        <Button onClick={controller.close} type="button" variant="ghost">
          <Icon name="close" />
          {t('preview.drafts.close')}
        </Button>
      </header>
      {controller.isLoading ? (
        <SkeletonGroup label={t('preview.drafts.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : controller.errorCode !== undefined || controller.drafts === undefined ? (
        <p className={receivingStyles.error} role="alert">
          {t(
            controller.errorCode === undefined
              ? ['preview.drafts.error']
              : resolvePreviewErrorKeys(controller.errorCode),
            { code: controller.errorCode },
          )}
        </p>
      ) : (
        <CargoTripDraftBoard
          controller={controller}
          drafts={controller.drafts}
          onShowState={onShowState}
          session={session}
        />
      )}
    </section>
  )
}
