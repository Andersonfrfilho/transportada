/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { usePreviewEmailAddress } from '../hooks/usePreviewEmailAddress.hook'
import type { PreviewEmailSettings } from '../shared/previewEmail.types'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'
import { PreviewEmailGeneratedAddress } from './PreviewEmailGeneratedAddress.component'

type PreviewEmailAddressControlProps = Readonly<{
  contractorId: string
  settings: PreviewEmailSettings
}>

/** Gerar o endereço (ou trocá-lo, com confirmação) e, logo depois, o painel que o mostra uma vez. */
export function PreviewEmailAddressControl({
  contractorId,
  settings,
}: PreviewEmailAddressControlProps): JSX.Element {
  const { t } = useTranslation('previewEmail')
  const address = usePreviewEmailAddress({
    contractorId,
    hasInboundToken: settings.hasInboundToken,
  })
  const confirmTitleId = useId()
  const hasLists = settings.forwarderAllowlist.length > 0 && settings.senderAllowlist.length > 0

  if (address.generated !== undefined) {
    return <PreviewEmailGeneratedAddress generated={address.generated} onClose={address.dismiss} />
  }

  return (
    <div className={previewStyles.controls}>
      {address.isConfirming ? (
        <div aria-labelledby={confirmTitleId} className={previewStyles.confirm} role="group">
          <p id={confirmTitleId}>
            <strong>{t('address.confirmTitle')}</strong>
          </p>
          <p>{t('address.confirmBody')}</p>
          <div className={styles.actions}>
            <Button onClick={address.confirm} type="button">
              {t('address.confirm')}
            </Button>
            <Button onClick={address.cancel} type="button" variant="ghost">
              {t('address.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      <Button
        disabled={!hasLists || address.isGenerating}
        onClick={address.request}
        type="button"
        variant={settings.hasInboundToken ? 'secondary' : 'default'}
      >
        <Icon name="refresh" />
        {address.isGenerating
          ? t('address.generating')
          : settings.hasInboundToken
            ? t('address.regenerate')
            : t('address.generate')}
      </Button>
      {hasLists ? null : <p className={styles.hint}>{t('address.needsLists')}</p>}
      {address.errorCode === undefined ? null : (
        <p className={styles.error} role="alert">
          {t(`address.errors.${address.errorCode}`, {
            defaultValue: t('address.errors.fallback', { code: address.errorCode }),
          })}
        </p>
      )}
    </div>
  )
}
