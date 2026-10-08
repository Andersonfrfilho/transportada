/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import {
  buildPreviewDetailRoute,
  formatPreviewEmailMoment,
  navigateToPreview,
} from '../shared/previewEmailLink.service'
import {
  PREVIEW_EMAIL_OUTCOMES,
  PREVIEW_EMAIL_REASON_CODES,
  type PreviewEmailIntake,
} from '../shared/previewEmail.types'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'

type PreviewEmailIntakeRowProps = Readonly<{ intake: PreviewEmailIntake; locale: string }>

function isOneOf(value: string, options: readonly string[]): boolean {
  return options.includes(value)
}

/** Resultado e motivo conhecidos saem traduzidos; um código que a API ganhou depois sai como veio. */
export function PreviewEmailIntakeRow({ intake, locale }: PreviewEmailIntakeRowProps): JSX.Element {
  const { t } = useTranslation('previewEmail')
  const isAccepted = intake.outcome === 'accepted'
  const outcome = isOneOf(intake.outcome, PREVIEW_EMAIL_OUTCOMES)
    ? t(`outcomes.${intake.outcome}`)
    : intake.outcome
  const reason =
    intake.reasonCode === null
      ? t('intakes.noReason')
      : isOneOf(intake.reasonCode, PREVIEW_EMAIL_REASON_CODES)
        ? t(`reasons.${intake.reasonCode}`)
        : intake.reasonCode

  return (
    <tr>
      <td data-label={t('intakes.columns.date')}>
        {formatPreviewEmailMoment({ locale, value: intake.receivedAt })}
      </td>
      <td data-label={t('intakes.columns.outcome')}>
        <span className={`${styles.badge} ${isAccepted ? styles.badgeOn : styles.badgeOff}`}>
          {outcome}
        </span>
      </td>
      <td data-label={t('intakes.columns.reason')}>{reason}</td>
      <td data-label={t('intakes.columns.preview')}>
        {intake.previewId === null ? (
          t('intakes.noReason')
        ) : (
          <a
            className={previewStyles.previewLink}
            href={buildPreviewDetailRoute(intake.previewId)}
            onClick={(event) => {
              event.preventDefault()
              if (intake.previewId === null) return
              navigateToPreview({
                navigator: createBrowserWorkspaceNavigator(),
                previewId: intake.previewId,
              })
            }}
          >
            {t('intakes.openPreview')}
          </a>
        )}
      </td>
    </tr>
  )
}
