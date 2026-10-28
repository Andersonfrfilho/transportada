/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import {
  buildWhatsAppEvolutionSubmission,
  startWhatsAppEvolutionDraft,
  type WhatsAppEvolutionDraft,
} from '../shared/whatsappEvolutionForm.service'
import {
  WHATSAPP_DEFAULT_PROVIDERS,
  type WhatsAppDefaultProvider,
  type WhatsAppEvolutionQr,
  type WhatsAppEvolutionSaveInput,
  type WhatsAppEvolutionSettings,
} from '../shared/whatsappEvolution.validation'
import styles from '../styles/companySettings.module.css'

export type WhatsAppEvolutionPanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  /** O resultado da última gravação deixa de descrever a tela no instante em que ela muda. */
  onEdit: () => void
  onQrOpenChange: (open: boolean) => void
  onSave: (input: WhatsAppEvolutionSaveInput) => void
  qr: WhatsAppEvolutionQr | undefined
  qrErrorCode: string | undefined
  qrLoading: boolean
  qrOpen: boolean
  saved: boolean
  stored: WhatsAppEvolutionSettings | null | undefined
}>

function WhatsAppEvolutionSkeleton() {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('whatsappEvolution.title')}>
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
    </SkeletonGroup>
  )
}

function WhatsAppEvolutionConnection(props: WhatsAppEvolutionPanelProps) {
  const { t } = useTranslation('companySettings')
  const stored = props.stored
  if (stored === null || stored === undefined) return null
  // O estado da tela é o do QR quando ele já respondeu; senão, o último gravado.
  const state = props.qr?.state ?? stored.connectionState
  const canConnect = stored.status === 'active' && stored.apiKeyConfigured

  return (
    <div className={styles.settingsFormFields} aria-live="polite">
      <span className={styles.settingsFormOrigin}>
        {t('whatsappEvolution.connection.label')}:{' '}
        {t(`whatsappEvolution.connection.state.${state}`)}
      </span>
      {canConnect ? null : (
        <p className={styles.settingsFormNote}>{t('whatsappEvolution.connection.needsEnabled')}</p>
      )}
      {canConnect && state !== 'open' && !props.qrOpen ? (
        <div className={styles.settingsFormActions}>
          <button type="button" onClick={() => props.onQrOpenChange(true)}>
            <Icon name="link" />
            {t('whatsappEvolution.connection.connect')}
          </button>
        </div>
      ) : null}
      {props.qrOpen && state !== 'open' ? (
        <div className={styles.whatsappQr}>
          {props.qr?.qrCode ? (
            <img
              alt={t('whatsappEvolution.connection.qrAlt')}
              className={styles.whatsappQrImage}
              height={240}
              src={props.qr.qrCode}
              width={240}
            />
          ) : props.qrLoading ? (
            <Skeleton height="240px" width="240px" />
          ) : null}
          {props.qr?.pairingCode ? (
            <p className={styles.settingsFormNote}>
              {t('whatsappEvolution.connection.pairingCode', { code: props.qr.pairingCode })}
            </p>
          ) : null}
          <p className={styles.settingsFormNote}>{t('whatsappEvolution.connection.qrHint')}</p>
          {props.qrErrorCode === undefined ? null : (
            <p role="alert">
              {t('whatsappEvolution.connection.qrError', { code: props.qrErrorCode })}
            </p>
          )}
          <div className={styles.settingsFormActions}>
            <button type="button" onClick={() => props.onQrOpenChange(false)}>
              <Icon name="close" />
              {t('whatsappEvolution.connection.closeQr')}
            </button>
          </div>
        </div>
      ) : null}
      {state === 'open' ? <p role="status">{t('whatsappEvolution.connection.connected')}</p> : null}
    </div>
  )
}

/** Rascunho local; a chave nunca volta da API, então o campo abre vazio e vazio significa "manter". */
function WhatsAppEvolutionForm(props: WhatsAppEvolutionPanelProps) {
  const { t } = useTranslation('companySettings')
  const [draft, setDraft] = useState<WhatsAppEvolutionDraft>(() =>
    startWhatsAppEvolutionDraft(props.stored),
  )
  const submission = buildWhatsAppEvolutionSubmission(draft, props.stored)

  function edit(patch: Partial<WhatsAppEvolutionDraft>) {
    props.onEdit()
    setDraft((current) => ({ ...current, ...patch }))
  }

  return (
    <div className={styles.settingsFormFields}>
      <label htmlFor="whatsapp-evolution-base-url">
        {t('whatsappEvolution.baseUrlLabel')}
        <input
          disabled={props.disabled}
          id="whatsapp-evolution-base-url"
          inputMode="url"
          maxLength={255}
          value={draft.baseUrl}
          aria-describedby="whatsapp-evolution-base-url-hint"
          onChange={(event) => edit({ baseUrl: event.target.value })}
        />
      </label>
      <p className={styles.settingsFormNote} id="whatsapp-evolution-base-url-hint">
        {t('whatsappEvolution.baseUrlHint')}
      </p>
      <label htmlFor="whatsapp-evolution-instance">
        {t('whatsappEvolution.instanceLabel')}
        <input
          disabled={props.disabled}
          id="whatsapp-evolution-instance"
          maxLength={64}
          value={draft.instanceName}
          onChange={(event) => edit({ instanceName: event.target.value })}
        />
      </label>
      <label htmlFor="whatsapp-evolution-api-key">
        {t('whatsappEvolution.apiKeyLabel')}
        <input
          autoComplete="off"
          disabled={props.disabled}
          id="whatsapp-evolution-api-key"
          maxLength={500}
          placeholder={
            props.stored?.apiKeyConfigured === true ? t('whatsappEvolution.apiKeyKeep') : ''
          }
          type="password"
          value={draft.apiKey}
          onChange={(event) => edit({ apiKey: event.target.value })}
        />
      </label>
      <label htmlFor="whatsapp-evolution-daily-cap">
        {t('whatsappEvolution.dailyCapLabel')}
        <input
          disabled={props.disabled}
          id="whatsapp-evolution-daily-cap"
          inputMode="numeric"
          maxLength={4}
          value={draft.dailyCap}
          onChange={(event) => edit({ dailyCap: event.target.value })}
        />
      </label>
      <label htmlFor="whatsapp-evolution-interval">
        {t('whatsappEvolution.intervalLabel')}
        <input
          disabled={props.disabled}
          id="whatsapp-evolution-interval"
          inputMode="numeric"
          maxLength={4}
          value={draft.minIntervalSeconds}
          onChange={(event) => edit({ minIntervalSeconds: event.target.value })}
        />
      </label>
      <p className={styles.settingsFormNote} id="whatsapp-evolution-risk">
        {t('whatsappEvolution.risk')}
      </p>
      <Checkbox
        ariaDescribedBy="whatsapp-evolution-risk"
        checked={draft.acknowledgeRisk}
        disabled={props.disabled}
        label={t('whatsappEvolution.acknowledgeRisk')}
        onChange={(checked) =>
          edit({
            acknowledgeRisk: checked,
            defaultProvider: checked && draft.enabled ? draft.defaultProvider : 'meta',
            enabled: checked && draft.enabled,
          })
        }
      />
      <Checkbox
        checked={draft.enabled}
        disabled={props.disabled || !draft.acknowledgeRisk}
        label={t('whatsappEvolution.enabledLabel')}
        onChange={(checked) =>
          edit({ defaultProvider: checked ? draft.defaultProvider : 'meta', enabled: checked })
        }
      />
      <label>
        <span>{t('whatsappEvolution.providerLabel')}</span>
        <Select
          ariaLabel={t('whatsappEvolution.providerLabel')}
          disabled={props.disabled}
          options={WHATSAPP_DEFAULT_PROVIDERS.map((provider) => ({
            label: t(`whatsappEvolution.provider.${provider}`),
            value: provider,
          }))}
          value={draft.defaultProvider}
          onChange={(value) => edit({ defaultProvider: value as WhatsAppDefaultProvider })}
        />
      </label>
      <p className={styles.settingsFormNote}>{t('whatsappEvolution.providerHint')}</p>
      <div className={styles.settingsFormActions}>
        <button
          disabled={props.disabled || submission === null}
          type="button"
          onClick={() => {
            if (submission !== null) props.onSave(submission)
          }}
        >
          <Icon name="save" />
          {t('whatsappEvolution.save')}
        </button>
      </div>
    </div>
  )
}

/**
 * Spec 281 T4 (RF2, RF7): configuração do WhatsApp gratuito (Evolution) e QR para conectar o número.
 * A chave nunca chega ao navegador; o QR vem da API, que o pede ao Evolution, e se renova sozinho.
 */
export function WhatsAppEvolutionPanel(props: WhatsAppEvolutionPanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section className={styles.settingsPanel} aria-labelledby="whatsapp-evolution-title">
      <div className={styles.sectionHeading}>
        <p className={styles.sectionKicker}>{t('whatsappEvolution.kicker')}</p>
        <h2 id="whatsapp-evolution-title">{t('whatsappEvolution.title')}</h2>
      </div>
      <p className={styles.settingsFormNote}>{t('whatsappEvolution.hint')}</p>
      {props.loading ? (
        <WhatsAppEvolutionSkeleton />
      ) : (
        <>
          <WhatsAppEvolutionForm key={props.stored?.updatedAt ?? 'new'} {...props} />
          <WhatsAppEvolutionConnection {...props} />
        </>
      )}
      {props.saved ? <p role="status">{t('whatsappEvolution.saved')}</p> : null}
      {props.errorCode === undefined ? null : (
        <p role="alert">{t('whatsappEvolution.error', { code: props.errorCode })}</p>
      )}
    </section>
  )
}
