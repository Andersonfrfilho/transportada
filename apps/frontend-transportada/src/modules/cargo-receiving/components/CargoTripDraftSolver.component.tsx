/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, buttonClassName } from '@/components/ui/button'
import { MultiVehicleSuggestionAction } from '@/modules/routing/components/MultiVehicleSuggestionAction.component'

import type { CargoPreviewTripDraftsController } from '../hooks/useCargoPreviewTripDrafts.hook'
import { CARGO_TRIP_DRAFT_SOLVER_DOCUMENT_LIMIT } from '../shared/cargoPreviewTripDraft.constant'
import type { CargoPreviewSession } from '../shared/cargoPreviewTripDraft.types'
import type { CargoTripDraftSolverScope } from '../shared/cargoPreviewTripDraftView.service'
import styles from '../styles/cargoTripDraft.module.css'

type CargoTripDraftSolverProps = Readonly<{
  controller: CargoPreviewTripDraftsController
  scope: CargoTripDraftSolverScope
  session: CargoPreviewSession
}>

function ScopeText({ scope }: Readonly<{ scope: CargoTripDraftSolverScope }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const count = scope.documentIds.length
  return (
    <p className={styles.scope} data-trip-draft-scope="">
      {scope.routeName === undefined
        ? t('preview.drafts.solver.scopeAll', { count })
        : t('preview.drafts.solver.scopeRoute', { count, route: scope.routeName })}
    </p>
  )
}

/**
 * A segunda visão (RF7): a proposta do roteirizador que JÁ existe, sobre as notas vinculadas e roteáveis. O
 * diálogo, a revisão e o aceite são os de sempre — aqui só se decide o escopo e quais notas seguem. Acima do
 * teto da API o botão fica desligado e a tela pede um roteiro, em vez de deixar o pedido falhar com 400.
 */
export function CargoTripDraftSolver({
  controller,
  scope,
  session,
}: CargoTripDraftSolverProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const documentIds = scope.isOverLimit ? [] : scope.documentIds

  return (
    <section className={styles.solver} data-trip-draft-solver="">
      <h3>{t('preview.drafts.solver.title')}</h3>
      <p className={styles.notice}>{t('preview.drafts.solver.hint')}</p>
      <ScopeText scope={scope} />
      {scope.isOverLimit ? (
        <p className={styles.notice}>
          {t('preview.drafts.solver.overLimit', { limit: CARGO_TRIP_DRAFT_SOLVER_DOCUMENT_LIMIT })}
        </p>
      ) : null}
      {scope.documentIds.length === 0 ? (
        <p className={styles.notice}>{t('preview.drafts.solver.empty')}</p>
      ) : null}
      {session.canManage ? (
        <div className={styles.cardActions}>
          <MultiVehicleSuggestionAction
            className={buttonClassName()}
            {...(session.companyId === undefined ? {} : { companyId: session.companyId })}
            documentIds={documentIds}
            label={t('preview.drafts.solver.action')}
            onAccepted={controller.handleAccepted}
            onOpenTrip={controller.openTrip}
            permissions={session.permissions}
          />
          {scope.routeName === undefined ? null : (
            <Button onClick={controller.clearRoute} type="button" variant="ghost">
              {t('preview.drafts.solver.backToAll')}
            </Button>
          )}
        </div>
      ) : (
        <p className={styles.notice}>{t('preview.drafts.readOnly')}</p>
      )}
    </section>
  )
}
