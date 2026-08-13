/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'

import { usePasswordReset } from '../hooks/usePasswordReset.hook'
import { createPasswordResetClient } from '../shared/passwordResetClient.service'
import styles from '../styles/identity.module.css'

function goToLogin(): void {
  window.location.assign('/')
}

function PasswordResetSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div className={styles.firstAccessShell}>
      <div className={styles.firstAccessPanel}>
        <SkeletonGroup className={styles.fieldGrid} label={label}>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="90%" />
          <Skeleton height="var(--field-height)" />
          <Skeleton height="var(--field-height)" />
        </SkeletonGroup>
      </div>
    </div>
  )
}

export function PasswordResetPage() {
  const { t } = useTranslation('identity')
  const [client] = useState(() =>
    createPasswordResetClient({
      apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
      fetch: (request) => fetch(request),
    }),
  )
  const reset = usePasswordReset({ client })

  if (reset.step === 'done') {
    return (
      <div className={styles.firstAccessShell}>
        <div className={styles.firstAccessPanel}>
          <h1 className={styles.firstAccessTitle}>{t('resetTitle')}</h1>
          <p className={styles.firstAccessDescription}>{t('resetDone')}</p>
          <button className={styles.primaryAction} onClick={goToLogin} type="button">
            <Icon name="shield" />
            {t('resetBackToLogin')}
          </button>
        </div>
      </div>
    )
  }

  const isCodeStep = reset.step === 'code'

  return (
    <div className={styles.firstAccessShell}>
      <div className={styles.firstAccessPanel}>
        <h1 className={styles.firstAccessTitle}>{t('resetTitle')}</h1>
        <p className={styles.firstAccessDescription}>
          {t(isCodeStep ? 'resetCodeSent' : 'resetDescription')}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void (isCodeStep ? reset.confirm() : reset.requestCode())
          }}
        >
          <fieldset className={styles.fieldGrid} disabled={reset.isSubmitting}>
            {isCodeStep ? (
              <>
                <label>
                  <span>{t('resetCode')}</span>
                  <input
                    autoComplete="one-time-code"
                    maxLength={64}
                    required
                    type="text"
                    value={reset.state.code}
                    onChange={(event) => reset.patch({ code: event.target.value })}
                  />
                </label>
                <label>
                  <span>{t('resetNewPassword')}</span>
                  <input
                    autoComplete="new-password"
                    maxLength={128}
                    minLength={12}
                    required
                    type="password"
                    value={reset.state.password}
                    onChange={(event) => reset.patch({ password: event.target.value })}
                  />
                </label>
              </>
            ) : (
              <label>
                <span>{t('resetUsername')}</span>
                <input
                  autoComplete="username"
                  maxLength={60}
                  minLength={3}
                  required
                  type="text"
                  value={reset.state.username}
                  onChange={(event) => reset.patch({ username: event.target.value })}
                />
              </label>
            )}
            {reset.feedbackKey === null ? null : (
              <p className={styles.feedbackError} role="alert">
                {t(reset.feedbackKey)}
              </p>
            )}
            <button className={styles.primaryAction} type="submit">
              <Icon name="shield" />
              {t(isCodeStep ? 'resetConfirmSubmit' : 'resetRequestSubmit')}
            </button>
          </fieldset>
        </form>
      </div>
    </div>
  )
}

export { PasswordResetSkeleton }
