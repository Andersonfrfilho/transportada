/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useCteProfileForm } from '../hooks/useCteProfileForm.hook'
import type {
  CteProfileBody,
  CteProfileDetail,
  CteProfileVersionInput,
} from '../shared/cteProfiles.types'
import styles from '../styles/cteProfiles.module.css'
import { CteProfileChargeFields } from './CteProfileChargeFields.component'
import { CteProfileComponentRows } from './CteProfileComponentRows.component'
import { CteProfileFiscalFields } from './CteProfileFiscalFields.component'
import { CteProfileIdentityFields } from './CteProfileIdentityFields.component'
import { CteProfileMatcherFields } from './CteProfileMatcherFields.component'

type CteProfileFormProps = Readonly<{
  onCancel: () => void
  onCreate: (body: CteProfileBody) => Promise<CteProfileDetail>
  onUpdate: (input: CteProfileBody & CteProfileVersionInput) => Promise<CteProfileDetail>
  profile?: CteProfileDetail
}>

export function CteProfileForm({ onCancel, onCreate, onUpdate, profile }: CteProfileFormProps) {
  const { t } = useTranslation('cteProfiles')
  const form = useCteProfileForm({
    onCreate,
    onUpdate,
    ...(profile === undefined ? {} : { profile }),
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void form.submit()
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <h2>{profile === undefined ? t('newProfile') : t('edit')}</h2>
      <CteProfileIdentityFields state={form.state} onChange={form.patch} />
      <CteProfileChargeFields state={form.state} onChange={form.patch} />
      <CteProfileComponentRows components={form.state.components} onChange={form.patch} />
      <CteProfileMatcherFields matchers={form.state.matchers} onChange={form.patch} />
      <CteProfileFiscalFields state={form.state} onChange={form.patch} />
      {form.feedbackKey === null ? null : (
        <p className={styles.feedback} role="status">
          {t(form.feedbackKey)}
        </p>
      )}
      <div className={styles.formActions}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <Icon name="close" />
          {t('cancel')}
        </Button>
        <Button disabled={form.isSaving} type="submit">
          <Icon name="save" />
          {t('save')}
        </Button>
      </div>
    </form>
  )
}
