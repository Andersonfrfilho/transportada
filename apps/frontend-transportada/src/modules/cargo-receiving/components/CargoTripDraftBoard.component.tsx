/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoPreviewTripDraftsController } from '../hooks/useCargoPreviewTripDrafts.hook'
import { CARGO_PREVIEW_DEFAULT_LOCALE } from '../shared/cargoPreview.constant'
import type { CargoPreviewItemState } from '../shared/cargoPreview.types'
import type {
  CargoPreviewSession,
  CargoPreviewTripDrafts,
} from '../shared/cargoPreviewTripDraft.types'
import { resolveTripDraftAction } from '../shared/cargoPreviewTripDraftView.service'
import styles from '../styles/cargoTripDraft.module.css'
import { CargoTripDraftOutside } from './CargoTripDraftOutside.component'
import { CargoTripDraftRouteCard } from './CargoTripDraftRouteCard.component'
import { CargoTripDraftSolver } from './CargoTripDraftSolver.component'

type CargoTripDraftBoardProps = Readonly<{
  controller: CargoPreviewTripDraftsController
  drafts: CargoPreviewTripDrafts
  onShowState: (state: CargoPreviewItemState) => void
  session: CargoPreviewSession
}>

/** As duas visões lado a lado (empilhadas no celular): os roteiros do contratante e a proposta do roteirizador. */
export function CargoTripDraftBoard({
  controller,
  drafts,
  onShowState,
  session,
}: CargoTripDraftBoardProps): JSX.Element {
  const { t, i18n } = useTranslation('cargoReceiving')
  const locale = i18n.resolvedLanguage ?? CARGO_PREVIEW_DEFAULT_LOCALE
  const { scope } = controller

  if (drafts.routes.length === 0)
    return <p className={styles.notice}>{t('preview.drafts.empty')}</p>

  return (
    <>
      <CargoTripDraftOutside drafts={drafts} onShowState={onShowState} />
      <div className={styles.board}>
        <div className={styles.column}>
          <h3>{t('preview.drafts.routes.title')}</h3>
          <p className={styles.notice}>{t('preview.drafts.routes.hint')}</p>
          <ul className={styles.routeList}>
            {drafts.routes.map((route) => (
              <CargoTripDraftRouteCard
                action={resolveTripDraftAction({ canManage: session.canManage, route })}
                isChosen={
                  route.routeName !== null && route.routeName === controller.selectedRouteName
                }
                key={route.routeName ?? ''}
                locale={locale}
                onChoose={() => {
                  if (route.routeName !== null) controller.toggleRoute(route.routeName)
                }}
                onCreate={() => controller.createTrip(route)}
                route={route}
              />
            ))}
          </ul>
        </div>
        {scope === undefined ? null : (
          <CargoTripDraftSolver controller={controller} scope={scope} session={session} />
        )}
      </div>
    </>
  )
}
