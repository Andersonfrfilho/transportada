import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { useCompanyUserWhatsAppPhone } from '../hooks/useCompanyUserWhatsAppPhone.hook'
import styles from '../styles/userAdministration.module.css'

type CompanyUserWhatsAppPanelProps = Readonly<{
  disabled?: boolean
  userId: string
}>

function toDisplayDate(iso: string | undefined): string {
  if (iso === undefined) return ''
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString('pt-BR')
}

function readErrorCode(error: unknown): string | undefined {
  return error instanceof Error
    ? error.message
    : error === null || error === undefined
      ? undefined
      : 'UNKNOWN'
}

/**
 * O administrador grava o WhatsApp de outra pessoa já verificado (decisão do dono, 10/11/2026), com botão
 * próprio: ele vai por outra rota que o resto da ficha, e o "Salvar" do perfil não pode arrastá-lo junto. O
 * número é o que identifica o atendente no grupo do bot; a API grava quem fez na trilha e devolve o número mascarado.
 */
export function CompanyUserWhatsAppPanel({
  disabled = false,
  userId,
}: CompanyUserWhatsAppPanelProps) {
  const { t } = useTranslation('identity')
  const [phone, setPhone] = useState('')
  const [notice, setNotice] = useState<'removed' | 'saved' | undefined>(undefined)
  const { bindMutation, query, unbindMutation } = useCompanyUserWhatsAppPhone({ userId })
  const state = query.data
  const isBusy = disabled || bindMutation.isPending || unbindMutation.isPending
  const errorCode =
    readErrorCode(bindMutation.error) ??
    readErrorCode(unbindMutation.error) ??
    readErrorCode(query.error)

  async function save(): Promise<void> {
    setNotice(undefined)
    try {
      await bindMutation.mutateAsync(phone)
      setPhone('')
      setNotice('saved')
    } catch {
      /* o erro fica em `bindMutation.error` e sai no alerta */
    }
  }

  async function unlink(): Promise<void> {
    setNotice(undefined)
    try {
      await unbindMutation.mutateAsync()
      setNotice('removed')
    } catch {
      /* idem */
    }
  }

  return (
    <div className={styles.mirrorPanel}>
      <h3>{t('users.editDialog.whatsapp.title')}</h3>
      <p className={styles.fieldHint}>{t('users.editDialog.whatsapp.intro')}</p>

      {state === undefined ? (
        query.isPending ? (
          <Skeleton height="1.25rem" variant="block" />
        ) : null
      ) : (
        <p className={styles.fieldHint}>
          {t(`users.editDialog.whatsapp.status.${state.status}`, {
            date: toDisplayDate(state.expiresAt),
            phone: state.phone ?? '',
          })}
        </p>
      )}

      <label className={styles.field}>
        <span>{t('users.editDialog.whatsapp.label')}</span>
        <input
          autoComplete="off"
          disabled={isBusy}
          inputMode="tel"
          maxLength={32}
          onChange={(event) => {
            setPhone(event.target.value)
            setNotice(undefined)
          }}
          placeholder={t('users.editDialog.whatsapp.placeholder')}
          type="tel"
          value={phone}
        />
      </label>

      <div className={styles.panelActions}>
        <Button disabled={isBusy || phone.trim() === ''} onClick={() => void save()} type="button">
          <Icon name="save" />
          {t('users.editDialog.whatsapp.save')}
        </Button>
        {state !== undefined && state.status !== 'none' && state.phone !== undefined ? (
          <Button disabled={isBusy} onClick={() => void unlink()} type="button" variant="ghost">
            <Icon name="close" />
            {t('users.editDialog.whatsapp.unlink')}
          </Button>
        ) : null}
      </div>

      {errorCode !== undefined ? (
        <p className={styles.feedback} role="alert">
          {t(`users.editDialog.whatsapp.errors.${errorCode}`, {
            defaultValue: t('users.errors.default'),
          })}
        </p>
      ) : notice === undefined ? null : (
        <p className={`${styles.feedback ?? ''} ${styles.noticeReady ?? ''}`} role="status">
          {t(`users.editDialog.whatsapp.${notice}`)}
        </p>
      )}
    </div>
  )
}
