/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useReceivingProfileForm } from '../hooks/useReceivingProfileForm.hook'
import type { ReceivingProfile } from '../shared/receivingProfile.types'
import styles from '../styles/contractorDirectory.module.css'
import { ReceivingProfileGroups } from './ReceivingProfileGroups.component'
import { RefusedFieldsHint } from './RefusedFieldsHint.component'

type ReceivingProfileFormProps = Readonly<{
  contractorId: string
  isDisabled: boolean
  profile: ReceivingProfile | null
}>

/** ADR-0094: o perfil é dado, e a regra vale para a chegada que ainda vai nascer — nunca para a que já existe. */
export function ReceivingProfileForm({
  contractorId,
  isDisabled,
  profile,
}: ReceivingProfileFormProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const form = useReceivingProfileForm({ contractorId, profile })
  const titleId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      aria-labelledby={titleId}
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.submit()
      }}
      ref={formRef}
    >
      <header>
        <h4 id={titleId}>{t('profile.title')}</h4>
        <p className={styles.hint}>{t('profile.intro')}</p>
      </header>

      <RefusedFieldsHint fields={form.feedback.summary} panelRef={formRef} />
      <ReceivingProfileGroups form={form} isDisabled={isDisabled} />

      {isDisabled ? null : (
        <div className={styles.actions}>
          <Button disabled={form.isSaving} type="submit">
            <Icon name="save" />
            {form.isSaving ? t('profile.saving') : t('profile.save')}
          </Button>
          {form.isSaved ? <p className={styles.saved}>{t('profile.saved')}</p> : null}
          {form.errorCode === undefined ? null : (
            <p className={styles.error} role="alert">
              {t('profile.error', { code: form.errorCode })}
            </p>
          )}
        </div>
      )}
    </form>
  )
}
