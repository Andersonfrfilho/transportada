/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { ApplicationFooter } from '@/modules/foundation/components/ApplicationFooter.component'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'

import { useUserActivation } from '../hooks/useUserActivation.hook'
import { createUserActivationClient } from '../shared/userActivationClient.service'
import styles from '../styles/identity.module.css'

function goToLogin(): void {
  window.location.assign('/')
}

export function UserActivationPage() {
  const { t } = useTranslation('identity')
  const [client] = useState(() =>
    createUserActivationClient({
      apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
      fetch: (request) => fetch(request),
    }),
  )
  const activation = useUserActivation({ client })

  if (activation.isDone) {
    return (
      <div className={styles.firstAccessShell}>
        <div className={styles.firstAccessPanel}>
          <h1 className={styles.firstAccessTitle}>{t('activationTitle')}</h1>
          <p className={styles.firstAccessDescription}>{t('activationDone')}</p>
          <button className={styles.primaryAction} onClick={goToLogin} type="button">
            <Icon name="shield" />
            {t('activationGoToLogin')}
          </button>
        </div>
        <ApplicationFooter />
      </div>
    )
  }

  return (
    <div className={styles.firstAccessShell}>
      <div className={styles.firstAccessPanel}>
        <h1 className={styles.firstAccessTitle}>{t('activationTitle')}</h1>
        <p className={styles.firstAccessDescription}>
          {t(
            activation.hasCodeFromLink ? 'activationDescriptionFromLink' : 'activationDescription',
          )}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void activation.activate()
          }}
        >
          <fieldset className={styles.fieldGrid} disabled={activation.isSubmitting}>
            <label>
              <span>{t('activationCode')}</span>
              <input
                autoComplete="one-time-code"
                maxLength={64}
                required
                type="text"
                value={activation.state.code}
                onChange={(event) => activation.patch({ code: event.target.value })}
              />
            </label>
            <label>
              <span>{t('activationPassword')}</span>
              <input
                autoComplete="new-password"
                maxLength={128}
                minLength={12}
                required
                type="password"
                value={activation.state.password}
                onChange={(event) => activation.patch({ password: event.target.value })}
              />
            </label>
            <label>
              <span>{t('activationPasswordConfirmation')}</span>
              <input
                autoComplete="new-password"
                maxLength={128}
                minLength={12}
                required
                type="password"
                value={activation.state.confirmation}
                onChange={(event) => activation.patch({ confirmation: event.target.value })}
              />
            </label>
            <p className={styles.firstAccessDescription}>{t('activationPasswordHint')}</p>
            {activation.feedbackKey === null ? null : (
              <p className={styles.feedbackError} role="alert">
                {t(activation.feedbackKey)}
              </p>
            )}
            <button className={styles.primaryAction} type="submit">
              <Icon name="shield" />
              {t('activationSubmit')}
            </button>
          </fieldset>
        </form>
      </div>
      <ApplicationFooter />
    </div>
  )
}
