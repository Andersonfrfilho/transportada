/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatPhone, PHONE_MASK_LENGTH, stripPhone } from '@/modules/shared/phone.service'
import { useCountdown } from '@/modules/shared/useCountdown.hook'

import { useWhatsAppPhone } from '../hooks/useWhatsAppPhone.hook'
import { WHATSAPP_PHONE_ERROR } from '../shared/whatsappPhone.constant'
import { resolveWhatsAppPhoneViewModel } from '../shared/whatsappPhoneViewModel.service'
import styles from '../styles/whatsappPhone.module.css'

function toDisplayDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString('pt-BR')
}

/**
 * O painel de vínculo do WhatsApp — usado no perfil do usuário do painel (dentro de um diálogo) e
 * no perfil do motorista no PWA (embutido direto, sem diálogo). Declarativo: toda a regra vive em
 * `useWhatsAppPhone` e em `resolveWhatsAppPhoneViewModel`, que decide o estado sem nunca inferir o
 * `status` na tela — ele sempre vem do `GET /me/whatsapp-phone`.
 */
export function WhatsAppPhonePanel(): JSX.Element {
  const { t } = useTranslation('identity')
  const [phone, setPhone] = useState('')
  const [isConfirmingUnlink, setIsConfirmingUnlink] = useState(false)
  const { query, requestMutation, unbindMutation } = useWhatsAppPhone()

  const errorCode =
    requestMutation.error instanceof Error ? requestMutation.error.message : undefined
  const isChannelMissing = errorCode === WHATSAPP_PHONE_ERROR.CHANNEL_NUMBER_MISSING

  const viewModel = resolveWhatsAppPhoneViewModel({
    generatedCode: requestMutation.data,
    isChannelMissing,
    isLoading: query.isLoading,
    state: query.data,
  })

  const remainingSeconds = useCountdown({
    onComplete: () => requestMutation.reset(),
    targetIso: viewModel.kind === 'codeGenerated' ? viewModel.expiresAt : null,
  })

  if (viewModel.kind === 'loading') {
    return (
      <SkeletonGroup className={styles.panel} label={t('whatsappPhone.loading')}>
        <Skeleton height="1rem" width="60%" />
        <Skeleton height="var(--field-height)" width="100%" />
      </SkeletonGroup>
    )
  }

  if (viewModel.kind === 'codeGenerated') {
    return (
      <div className={styles.panel}>
        <div className={styles.codeCard}>
          <p>{t('whatsappPhone.codeTitle')}</p>
          <p className={styles.code}>{viewModel.code}</p>
          <p>{t('whatsappPhone.codeInstruction')}</p>
          <div className={styles.companyNumberRow}>
            <span>{viewModel.companyNumber}</span>
            <CopyButton
              copiedLabel={t('whatsappPhone.copyCompanyNumberDone')}
              label={t('whatsappPhone.copyCompanyNumber')}
              value={viewModel.companyNumber}
            />
          </div>
          <p role="status">{t('whatsappPhone.expiresIn', { seconds: remainingSeconds })}</p>
        </div>
      </div>
    )
  }

  if (viewModel.kind === 'linked' || viewModel.kind === 'expired') {
    return (
      <div className={styles.panel}>
        <div className={styles.linkedRow}>
          <div>
            <p>{viewModel.phone}</p>
            {viewModel.kind === 'linked' && viewModel.expiresAt !== undefined ? (
              <p className={styles.feedback}>
                {t('whatsappPhone.linkedUntil', { date: toDisplayDate(viewModel.expiresAt) })}
              </p>
            ) : (
              <p className={styles.feedback} role="alert">
                {t('whatsappPhone.linkExpired')}
              </p>
            )}
          </div>
        </div>
        {isConfirmingUnlink ? (
          <div className={styles.confirm} role="alertdialog">
            <p>{t('whatsappPhone.unlinkConfirmBody')}</p>
            <Button onClick={() => setIsConfirmingUnlink(false)} type="button" variant="ghost">
              {t('whatsappPhone.unlinkCancel')}
            </Button>
            <Button
              disabled={unbindMutation.isPending}
              onClick={() => unbindMutation.mutate()}
              type="button"
              variant="secondary"
            >
              <Icon name="trash" />
              {t('whatsappPhone.unlinkConfirm')}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setIsConfirmingUnlink(true)} type="button" variant="ghost">
            <Icon name="trash" />
            {t('whatsappPhone.unlink')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <form
      className={styles.panel}
      onSubmit={(event) => {
        event.preventDefault()
        requestMutation.mutate(stripPhone(phone))
      }}
    >
      <label className={styles.field}>
        <span>{t('whatsappPhone.phoneLabel')}</span>
        <input
          inputMode="tel"
          maxLength={PHONE_MASK_LENGTH}
          onChange={(event) => setPhone(formatPhone(event.target.value))}
          placeholder={t('whatsappPhone.phonePlaceholder')}
          type="text"
          value={phone}
        />
      </label>
      {viewModel.kind === 'channelMissing' ? (
        <p className={styles.feedback} role="alert">
          {t('whatsappPhone.channelMissing')}
        </p>
      ) : errorCode !== undefined ? (
        <p className={styles.feedback} role="alert">
          {t(`whatsappPhone.errors.${errorCode}`, {
            defaultValue: t('whatsappPhone.requestFailed'),
          })}
        </p>
      ) : null}
      <Button disabled={requestMutation.isPending || stripPhone(phone) === ''} type="submit">
        <Icon name="message" />
        {requestMutation.isPending ? t('whatsappPhone.generating') : t('whatsappPhone.generate')}
      </Button>
    </form>
  )
}
