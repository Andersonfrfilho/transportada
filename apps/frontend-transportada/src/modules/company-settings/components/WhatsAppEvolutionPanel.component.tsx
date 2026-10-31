/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { createWhatsAppQrObjectUrl } from '../shared/whatsappEvolutionQrImage.service'
import {
  buildWhatsAppEvolutionSubmission,
  startWhatsAppEvolutionDraft,
  type WhatsAppEvolutionDraft,
} from '../shared/whatsappEvolutionForm.service'
import {
  WHATSAPP_DEFAULT_PROVIDERS,
  type WhatsAppDefaultProvider,
  type WhatsAppEvolutionConnection,
  type WhatsAppEvolutionQr,
  type WhatsAppEvolutionSaveInput,
  type WhatsAppEvolutionSettings,
} from '../shared/whatsappEvolution.validation'
import calendarStyles from '../styles/businessCalendar.module.css'
import styles from '../styles/companySettings.module.css'

export type WhatsAppEvolutionPanelProps = Readonly<{
  /** Leitura periódica do estado, fora do QR; é ela que mostra a queda. */
  connection: WhatsAppEvolutionConnection | undefined
  connectionErrorCode: string | undefined
  disabled: boolean
  disconnecting: boolean
  /** Desfaz o pareamento no Evolution; a instância fica livre para ler o QR de outro número. */
  onDisconnect: () => void
  errorCode: string | undefined
  loading: boolean
  /** O resultado da última gravação deixa de descrever a tela no instante em que ela muda. */
  onEdit: () => void
  onProvision: (acknowledgeRisk: boolean) => void
  onQrOpenChange: (open: boolean) => void
  /** Pede um QR novo na hora, sem esperar a renovação automática. */
  onQrRefresh: () => void
  /** O ambiente cria a instância sozinho: a tela pede só o aviso de risco, sem endereço nem chave. */
  provisioningAvailable: boolean
  onSave: (input: WhatsAppEvolutionSaveInput) => void
  qr: WhatsAppEvolutionQr | undefined
  qrErrorCode: string | undefined
  qrLoading: boolean
  /** Instante (ms) em que o QR exibido foi recebido; a validade conta a partir dele. */
  qrReceivedAt: number
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

const STATE_BADGE = {
  close: 'warning',
  connecting: 'info',
  open: 'success',
  unknown: 'secondary',
} as const

/** `img-src` só admite `blob:`; o QR (data URL) vira URL de objeto e é liberada ao trocar ou sair. */
function useQrObjectUrl(qrCode: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const created =
      qrCode === null || qrCode === undefined ? null : createWhatsAppQrObjectUrl(qrCode)
    setUrl(created)
    return () => {
      if (created !== null) URL.revokeObjectURL(created)
    }
  }, [qrCode])
  return url
}

/** O QR vale poucos segundos: a tela diz quanto resta e avisa quando o código na tela já não serve. */
function WhatsAppEvolutionQrValidity(
  props: Readonly<{ receivedAt: number; refreshAfterSeconds: number }>,
) {
  const { t } = useTranslation('companySettings')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const remaining = Math.max(
    0,
    Math.ceil(props.receivedAt / 1000 + props.refreshAfterSeconds - now / 1000),
  )

  return remaining > 0 ? (
    <p className={calendarStyles.hint} role="status">
      {t('whatsappEvolution.connection.qrValidity', { seconds: remaining })}
    </p>
  ) : (
    <p className={calendarStyles.refusal} role="alert">
      {t('whatsappEvolution.connection.qrExpired')}
    </p>
  )
}

function WhatsAppEvolutionConnectionStatus(props: WhatsAppEvolutionPanelProps) {
  const { t } = useTranslation('companySettings')
  const qrImageUrl = useQrObjectUrl(props.qr?.qrCode)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const stored = props.stored
  if (stored === null || stored === undefined) return null
  // O estado da tela é o do QR quando ele já respondeu; senão, o último gravado.
  // 'open' vence: a leitura curta do estado enxerga a conexão antes do próximo QR.
  const state =
    props.connection?.state === 'open'
      ? 'open'
      : props.qrOpen
        ? (props.qr?.state ?? stored.connectionState)
        : (props.connection?.state ?? stored.connectionState)
  const checkedAt = props.connection?.checkedAt ?? stored.connectionCheckedAt
  const canConnect = stored.status === 'active' && stored.apiKeyConfigured

  return (
    <section aria-labelledby="whatsapp-evolution-connection-title" className={calendarStyles.block}>
      <h3 id="whatsapp-evolution-connection-title">{t('whatsappEvolution.connection.title')}</h3>
      <div aria-live="polite" className={styles.settingsFormFields}>
        <p className={styles.whatsappState}>
          <Badge variant={STATE_BADGE[state]}>
            {t(`whatsappEvolution.connection.state.${state}`)}
          </Badge>
          {checkedAt === null ? null : (
            <span className={styles.settingsFormOrigin}>
              {t('whatsappEvolution.connection.checkedAt', {
                time: new Date(checkedAt).toLocaleTimeString('pt-BR'),
              })}
            </span>
          )}
        </p>
        {props.connectionErrorCode === undefined ? null : (
          <p className={calendarStyles.refusal} role="alert">
            {t('whatsappEvolution.connection.checkError', { code: props.connectionErrorCode })}
          </p>
        )}
        {canConnect && state === 'close' ? (
          <p className={calendarStyles.refusal} role="alert">
            {t('whatsappEvolution.connection.dropped')}
          </p>
        ) : null}
        {canConnect ? null : (
          <p className={calendarStyles.hint}>{t('whatsappEvolution.connection.needsEnabled')}</p>
        )}
        {state === 'open' ? (
          <p className={calendarStyles.status} role="status">
            {props.connection?.ownerMasked === undefined
              ? t('whatsappEvolution.connection.connected')
              : t('whatsappEvolution.connection.connectedNumber', {
                  number: props.connection.ownerMasked,
                })}
          </p>
        ) : null}
        {canConnect && state === 'open' ? (
          confirmingDisconnect ? (
            <div className={calendarStyles.actions}>
              <p className={calendarStyles.routingNotice}>
                {t('whatsappEvolution.connection.disconnectConfirm')}
              </p>
              <Button
                disabled={props.disconnecting}
                type="button"
                onClick={() => {
                  setConfirmingDisconnect(false)
                  props.onDisconnect()
                }}
              >
                <Icon name="close" />
                {t('whatsappEvolution.connection.disconnectConfirmAction')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmingDisconnect(false)}
              >
                {t('whatsappEvolution.connection.disconnectCancel')}
              </Button>
            </div>
          ) : (
            <div className={calendarStyles.actions}>
              <Button
                disabled={props.disconnecting}
                type="button"
                variant="secondary"
                onClick={() => setConfirmingDisconnect(true)}
              >
                <Icon name="close" />
                {t('whatsappEvolution.connection.disconnect')}
              </Button>
            </div>
          )
        ) : null}
        {canConnect && state !== 'open' && !props.qrOpen ? (
          <div className={calendarStyles.actions}>
            <Button type="button" onClick={() => props.onQrOpenChange(true)}>
              <Icon name="link" />
              {state === 'close'
                ? t('whatsappEvolution.connection.reconnect')
                : t('whatsappEvolution.connection.connect')}
            </Button>
          </div>
        ) : null}
        {props.qrOpen && state !== 'open' ? (
          <div className={styles.whatsappQr}>
            {qrImageUrl !== null ? (
              <img
                alt={t('whatsappEvolution.connection.qrAlt')}
                className={styles.whatsappQrImage}
                height={240}
                src={qrImageUrl}
                width={240}
              />
            ) : props.qrErrorCode === undefined ? (
              <>
                <Skeleton height="240px" width="240px" />
                <p className={calendarStyles.hint} role="status">
                  {t('whatsappEvolution.connection.qrWaiting')}
                </p>
              </>
            ) : null}
            {props.qr?.qrCode && qrImageUrl !== null ? (
              <WhatsAppEvolutionQrValidity
                key={props.qrReceivedAt}
                receivedAt={props.qrReceivedAt}
                refreshAfterSeconds={props.qr.refreshAfterSeconds}
              />
            ) : null}
            {props.qr?.pairingCode ? (
              <p className={calendarStyles.hint}>
                {t('whatsappEvolution.connection.pairingCode', { code: props.qr.pairingCode })}
              </p>
            ) : null}
            <p className={calendarStyles.hint}>{t('whatsappEvolution.connection.qrHint')}</p>
            {props.qrErrorCode === undefined ? null : (
              <p className={calendarStyles.refusal} role="alert">
                {t('whatsappEvolution.connection.qrError', { code: props.qrErrorCode })}
              </p>
            )}
            <div className={calendarStyles.actions}>
              <Button type="button" variant="secondary" onClick={props.onQrRefresh}>
                <Icon name="refresh" />
                {t('whatsappEvolution.connection.refreshQr')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => props.onQrOpenChange(false)}>
                <Icon name="close" />
                {t('whatsappEvolution.connection.closeQr')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** Spec 281 T4b: sem digitar endereço nem chave; a API cria a instância e o QR aparece em seguida. */
function WhatsAppEvolutionProvision(props: WhatsAppEvolutionPanelProps) {
  const { t } = useTranslation('companySettings')
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <section aria-labelledby="whatsapp-evolution-provision-title" className={calendarStyles.block}>
      <h3 id="whatsapp-evolution-provision-title">{t('whatsappEvolution.provision.title')}</h3>
      <p className={calendarStyles.hint}>{t('whatsappEvolution.provision.hint')}</p>
      <p className={calendarStyles.routingNotice} id="whatsapp-evolution-provision-risk">
        {t('whatsappEvolution.risk')}
      </p>
      <Checkbox
        ariaDescribedBy="whatsapp-evolution-provision-risk"
        checked={acknowledged}
        disabled={props.disabled}
        label={t('whatsappEvolution.acknowledgeRisk')}
        onChange={setAcknowledged}
      />
      <div className={calendarStyles.actions}>
        <Button
          disabled={props.disabled || !acknowledged}
          type="button"
          onClick={() => props.onProvision(acknowledged)}
        >
          <Icon name="link" />
          {t('whatsappEvolution.provision.action')}
        </Button>
      </div>
    </section>
  )
}

function WhatsAppEvolutionField(
  props: Readonly<{
    children: React.ReactNode
    hint?: string
    htmlFor: string
    label: string
    wide?: boolean
  }>,
) {
  return (
    <div
      className={`${calendarStyles.field} ${props.wide === true ? calendarStyles.fieldWide : ''}`}
    >
      <label className={calendarStyles.fieldLabel} htmlFor={props.htmlFor}>
        {props.label}
      </label>
      {props.children}
      {props.hint === undefined ? null : <p className={calendarStyles.hint}>{props.hint}</p>}
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
    <section aria-labelledby="whatsapp-evolution-settings-title" className={calendarStyles.block}>
      <h3 id="whatsapp-evolution-settings-title">{t('whatsappEvolution.settingsTitle')}</h3>
      <div className={calendarStyles.form}>
        <div className={styles.whatsappFields}>
          <WhatsAppEvolutionField
            hint={t('whatsappEvolution.baseUrlHint')}
            htmlFor="whatsapp-evolution-base-url"
            label={t('whatsappEvolution.baseUrlLabel')}
            wide
          >
            <input
              className={calendarStyles.input}
              disabled={props.disabled}
              id="whatsapp-evolution-base-url"
              inputMode="url"
              maxLength={255}
              value={draft.baseUrl}
              onChange={(event) => edit({ baseUrl: event.target.value })}
            />
          </WhatsAppEvolutionField>
          <WhatsAppEvolutionField
            htmlFor="whatsapp-evolution-instance"
            label={t('whatsappEvolution.instanceLabel')}
          >
            <input
              className={calendarStyles.input}
              disabled={props.disabled}
              id="whatsapp-evolution-instance"
              maxLength={64}
              value={draft.instanceName}
              onChange={(event) => edit({ instanceName: event.target.value })}
            />
          </WhatsAppEvolutionField>
          <WhatsAppEvolutionField
            htmlFor="whatsapp-evolution-api-key"
            label={t('whatsappEvolution.apiKeyLabel')}
          >
            <input
              autoComplete="off"
              className={calendarStyles.input}
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
          </WhatsAppEvolutionField>
          <WhatsAppEvolutionField
            htmlFor="whatsapp-evolution-daily-cap"
            label={t('whatsappEvolution.dailyCapLabel')}
          >
            <input
              className={calendarStyles.input}
              disabled={props.disabled}
              id="whatsapp-evolution-daily-cap"
              inputMode="numeric"
              maxLength={4}
              value={draft.dailyCap}
              onChange={(event) => edit({ dailyCap: event.target.value })}
            />
          </WhatsAppEvolutionField>
          <WhatsAppEvolutionField
            htmlFor="whatsapp-evolution-interval"
            label={t('whatsappEvolution.intervalLabel')}
          >
            <input
              className={calendarStyles.input}
              disabled={props.disabled}
              id="whatsapp-evolution-interval"
              inputMode="numeric"
              maxLength={4}
              value={draft.minIntervalSeconds}
              onChange={(event) => edit({ minIntervalSeconds: event.target.value })}
            />
          </WhatsAppEvolutionField>
        </div>
        <p className={calendarStyles.routingNotice} id="whatsapp-evolution-risk">
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
        <div className={calendarStyles.field}>
          <span className={calendarStyles.fieldLabel}>{t('whatsappEvolution.providerLabel')}</span>
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
          <p className={calendarStyles.hint}>{t('whatsappEvolution.providerHint')}</p>
        </div>
        <div className={calendarStyles.actions}>
          <Button
            disabled={props.disabled || submission === null}
            type="button"
            onClick={() => {
              if (submission !== null) props.onSave(submission)
            }}
          >
            <Icon name="save" />
            {t('whatsappEvolution.save')}
          </Button>
        </div>
      </div>
    </section>
  )
}

/**
 * Spec 281 T4 (RF2, RF7): configuração do WhatsApp gratuito (Evolution) e QR para conectar o número.
 * A chave nunca chega ao navegador; o QR vem da API, que o pede ao Evolution, e se renova sozinho.
 */
export function WhatsAppEvolutionPanel(props: WhatsAppEvolutionPanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section aria-labelledby="whatsapp-evolution-title" className={calendarStyles.panel}>
      <div className={calendarStyles.panelHeading}>
        <p className={calendarStyles.kicker}>{t('whatsappEvolution.kicker')}</p>
        <h2 id="whatsapp-evolution-title">{t('whatsappEvolution.title')}</h2>
        <p className={calendarStyles.hint}>{t('whatsappEvolution.hint')}</p>
      </div>
      {props.loading ? (
        <WhatsAppEvolutionSkeleton />
      ) : (
        <>
          <WhatsAppEvolutionConnectionStatus {...props} />
          {props.provisioningAvailable && props.stored == null ? (
            <WhatsAppEvolutionProvision {...props} />
          ) : (
            <WhatsAppEvolutionForm key={props.stored?.updatedAt ?? 'new'} {...props} />
          )}
        </>
      )}
      {props.saved ? (
        <p className={calendarStyles.status} role="status">
          {t('whatsappEvolution.saved')}
        </p>
      ) : null}
      {props.errorCode === undefined ? null : (
        <p className={calendarStyles.refusal} role="alert">
          {t('whatsappEvolution.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
