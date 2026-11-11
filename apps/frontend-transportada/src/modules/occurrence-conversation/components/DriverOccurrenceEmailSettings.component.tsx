/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useDriverOccurrenceEmailQuery,
  useSaveDriverOccurrenceEmailMutation,
} from '../queries/driverOccurrenceEmail.query'
import {
  DRIVER_OCCURRENCE_EMAIL_FAILURE,
  DriverOccurrenceEmailRequestError,
  type DriverOccurrenceEmailFailure,
} from '../shared/driverOccurrenceEmailClient.service'
import styles from '../styles/occurrenceConversation.module.css'

type DriverOccurrenceEmailSettingsProps = Readonly<{
  /** `settings.manage`: sem ela a seção não aparece e a consulta não sobe (a API recusaria). */
  canManage: boolean
}>

function failureOf(error: unknown): DriverOccurrenceEmailFailure {
  return error instanceof DriverOccurrenceEmailRequestError
    ? error.failure
    : DRIVER_OCCURRENCE_EMAIL_FAILURE.FAILED
}

function formatMoment(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

/**
 * Spec 322: liga e desliga, para a empresa toda, o e-mail do aviso "ocorrência registrada pelo motorista". Desligado,
 * o aviso segue no sino (caixa de entrada); a frase do que acontece fica sempre à vista, ligada ao controle por
 * `aria-describedby`.
 */
export function DriverOccurrenceEmailSettings({ canManage }: DriverOccurrenceEmailSettingsProps) {
  const { i18n, t } = useTranslation('occurrenceConversation')
  const titleId = useId()
  const descriptionId = useId()
  const query = useDriverOccurrenceEmailQuery({ enabled: canManage })
  const mutation = useSaveDriverOccurrenceEmailMutation()
  const settings = query.data

  function handleToggle(enabled: boolean): void {
    if (mutation.isPending) return
    mutation.mutate(enabled)
  }

  if (!canManage) return null

  return (
    <section aria-labelledby={titleId} className={`${styles.panel} ${styles.settingsPanel}`}>
      <h2 id={titleId}>{t('driverOccurrenceEmail.title')}</h2>
      {query.isPending ? (
        <SkeletonGroup label={t('driverOccurrenceEmail.loading')}>
          <Skeleton height="2rem" width="60%" />
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <div className={styles.panel}>
          <p className={styles.error} role="alert">
            {t(`driverOccurrenceEmail.error.${failureOf(query.error)}`)}
          </p>
          <Button onClick={() => void query.refetch()} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('driverOccurrenceEmail.retry')}
          </Button>
        </div>
      ) : null}
      {settings === undefined ? null : (
        <>
          <div id={descriptionId}>
            <p className={styles.hint}>{t('driverOccurrenceEmail.description')}</p>
            <p className={styles.hint}>{t('driverOccurrenceEmail.effectOfTurningOff')}</p>
          </div>
          <Checkbox
            ariaDescribedBy={descriptionId}
            checked={settings.enabled}
            label={t('driverOccurrenceEmail.toggle')}
            onChange={handleToggle}
          />
          {settings.updatedAt === undefined ? null : (
            <p className={styles.hint}>
              {t('driverOccurrenceEmail.lastChange', {
                when: formatMoment(settings.updatedAt, i18n.resolvedLanguage ?? 'pt-BR'),
              })}
            </p>
          )}
        </>
      )}
      {mutation.isPending ? (
        <p className={styles.hint} role="status">
          {t('driverOccurrenceEmail.saving')}
        </p>
      ) : null}
      {mutation.isError ? (
        <p className={styles.error} role="alert">
          {t(`driverOccurrenceEmail.error.${failureOf(mutation.error)}`)}
        </p>
      ) : null}
    </section>
  )
}
