/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { usePreviewEmailAllowlists } from '../hooks/usePreviewEmailAllowlists.hook'
import { PREVIEW_ALLOWLIST_KIND, type PreviewEmailSettings } from '../shared/previewEmail.types'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'
import { PreviewEmailListField } from './PreviewEmailListField.component'
import { RefusedFieldsHint } from './RefusedFieldsHint.component'

type PreviewEmailAllowlistsFormProps = Readonly<{
  contractorId: string
  settings: PreviewEmailSettings
}>

/** As duas listas que decidem quem pode alimentar a prévia por e-mail: sem as duas, o endereço não abre. */
export function PreviewEmailAllowlistsForm({
  contractorId,
  settings,
}: PreviewEmailAllowlistsFormProps): JSX.Element {
  const { t } = useTranslation('previewEmail')
  const form = usePreviewEmailAllowlists({ contractorId, settings })
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
      <h5 id={titleId}>{t('lists.title')}</h5>
      <RefusedFieldsHint fields={form.refusedFields} panelRef={formRef} />
      <div className={previewStyles.lists}>
        {[PREVIEW_ALLOWLIST_KIND.forwarder, PREVIEW_ALLOWLIST_KIND.sender].map((kind) => (
          <PreviewEmailListField
            isDisabled={form.isSaving}
            issues={form.issues[kind]}
            key={kind}
            kind={kind}
            onChange={(text) => form.setText({ kind, text })}
            value={form.texts[kind]}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <Button disabled={form.isSaving} type="submit">
          <Icon name="save" />
          {form.isSaving ? t('lists.saving') : t('lists.save')}
        </Button>
        {form.isSaved ? <p className={styles.saved}>{t('lists.saved')}</p> : null}
        {form.errorCode === undefined ? null : (
          <p className={styles.error} role="alert">
            {t('lists.error', { code: form.errorCode })}
          </p>
        )}
      </div>
    </form>
  )
}
