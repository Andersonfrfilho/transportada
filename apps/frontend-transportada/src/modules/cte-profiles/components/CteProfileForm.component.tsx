/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useCteProfileForm } from '../hooks/useCteProfileForm.hook'
import type {
  CteProfileBody,
  CteProfileDetail,
  CteProfileVersionInput,
} from '../shared/cteProfiles.types'
import { type NfseProfileOption, showsCteFiscalFields } from '../shared/cteProfilesForm.service'
import styles from '../styles/cteProfiles.module.css'
import { CteProfileChargeFields } from './CteProfileChargeFields.component'
import { CteProfileComponentRows } from './CteProfileComponentRows.component'
import { CteProfileFiscalFields } from './CteProfileFiscalFields.component'
import { CteProfileIdentityFields } from './CteProfileIdentityFields.component'
import { CteProfileMatcherFields } from './CteProfileMatcherFields.component'
import { CteProfileOutputFields } from './CteProfileOutputFields.component'

type CteProfileFormProps = Readonly<{
  nfseProfiles: readonly NfseProfileOption[]
  onCancel: () => void
  onCreate: (body: CteProfileBody) => Promise<CteProfileDetail>
  onUpdate: (input: CteProfileBody & CteProfileVersionInput) => Promise<CteProfileDetail>
  profile?: CteProfileDetail
}>

export function CteProfileForm({
  nfseProfiles,
  onCancel,
  onCreate,
  onUpdate,
  profile,
}: CteProfileFormProps) {
  const { t } = useTranslation('cteProfiles')
  const { panelRef } = useRevealedPanel<HTMLFormElement>()
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
    <form className={styles.panel} onSubmit={handleSubmit} ref={panelRef}>
      <h2>{profile === undefined ? t('newProfile') : t('edit')}</h2>
      <CteProfileIdentityFields state={form.state} onChange={form.patch} />
      <CteProfileOutputFields
        nfseProfiles={nfseProfiles}
        state={form.state}
        onChange={form.patch}
      />
      {showsCteFiscalFields(form.state.outputDocument) ? (
        <CteProfileChargeFields state={form.state} onChange={form.patch} />
      ) : null}
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
