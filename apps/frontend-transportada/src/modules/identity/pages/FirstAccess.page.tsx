/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { ApplicationFooter } from '@/modules/foundation/components/ApplicationFooter.component'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'

import { useBootstrapAvailability } from '../hooks/useBootstrapAvailability.hook'
import { useBootstrapFirstAdmin } from '../hooks/useBootstrapFirstAdmin.hook'
import type { BootstrapFormState } from '../hooks/useBootstrapFirstAdmin.hook'
import { createBootstrapClient } from '../shared/bootstrapClient.service'
import styles from '../styles/identity.module.css'

type TextField = keyof BootstrapFormState
type FieldDefinition = Readonly<{
  field: TextField
  maxLength: number
  minLength?: number
  type: 'email' | 'password' | 'text'
}>

const ADMINISTRATOR_FIELDS: readonly FieldDefinition[] = [
  { field: 'firstName', maxLength: 100, type: 'text' },
  { field: 'lastName', maxLength: 100, type: 'text' },
  { field: 'email', maxLength: 254, type: 'email' },
  { field: 'username', maxLength: 60, minLength: 3, type: 'text' },
  { field: 'password', maxLength: 128, minLength: 12, type: 'password' },
  { field: 'token', maxLength: 512, type: 'password' },
]

function getBootstrapClient() {
  return createBootstrapClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
  })
}

function goToLogin(): void {
  window.location.assign('/')
}

/** Referência estável: recriada a cada render, a sondagem redispararia o efeito sem parar. */
function probeBootstrapAvailability(): Promise<boolean> {
  return getBootstrapClient().checkAvailability()
}

function FirstAccessSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div className={styles.firstAccessShell}>
      <div className={styles.firstAccessPanel}>
        <SkeletonGroup className={styles.fieldGrid} label={label}>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="90%" />
          {ADMINISTRATOR_FIELDS.map((definition) => (
            <Skeleton height="var(--field-height)" key={definition.field} />
          ))}
        </SkeletonGroup>
      </div>
    </div>
  )
}

export function FirstAccessPage() {
  const { t } = useTranslation('identity')
  const availability = useBootstrapAvailability({ checkAvailability: probeBootstrapAvailability })
  const wizard = useBootstrapFirstAdmin({
    createFirstAdmin: (input) => getBootstrapClient().createFirstAdmin(input),
    onSuccess: goToLogin,
  })

  // Fechada, a tela não mostra formulário nenhum: o esqueleto cobre a saída para o login.
  if (availability !== 'open') return <FirstAccessSkeleton label={t('loading')} />

  return (
    <div className={styles.firstAccessShell}>
      <div className={styles.firstAccessPanel}>
        <h1 className={styles.firstAccessTitle}>{t('title')}</h1>
        <p className={styles.firstAccessDescription}>{t('description')}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void wizard.submit()
          }}
        >
          <fieldset className={styles.fieldGrid} disabled={wizard.isSubmitting}>
            {ADMINISTRATOR_FIELDS.map((definition) => (
              <label key={definition.field}>
                <span>{t(definition.field)}</span>
                <input
                  autoComplete="off"
                  maxLength={definition.maxLength}
                  minLength={definition.minLength}
                  required
                  type={definition.type}
                  value={wizard.state[definition.field]}
                  onChange={(event) => wizard.patch({ [definition.field]: event.target.value })}
                />
              </label>
            ))}
            {wizard.feedbackKey === null ? null : (
              <p className={styles.feedbackError} role="alert">
                {t('unavailable')}
              </p>
            )}
            <button className={styles.primaryAction} type="submit">
              <Icon name="shield" />
              {t(wizard.isSubmitting ? 'submitting' : 'submit')}
            </button>
          </fieldset>
        </form>
      </div>
      <ApplicationFooter />
    </div>
  )
}
