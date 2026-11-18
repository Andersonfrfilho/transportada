/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useOccurrenceTripMapData } from '../hooks/useOccurrenceTripMapData.hook'
import { resolveOccurrenceNoteStopPoint } from '../shared/occurrenceTripMapStops.service'
import { useSendDriverAppMessageMutation } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'

import { formatPostalCode } from '@/modules/shared/postalCode.service'
import { usePostalCodeLookup } from '@/modules/shared/usePostalCodeLookup.hook'

import {
  useFindDriverAddressPoint,
  useSendDriverAddressToWhatsAppGroup,
} from '../queries/useSendDriverAddressToWhatsAppGroup.query'
import {
  buildDriverAddressChatMessage,
  composeDriverAddressText,
  type DriverAddressFields,
} from '../shared/driverAddressMessage.service'
import type { TripOccurrenceDetail } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'
import { OccurrenceAddressMap } from './OccurrenceAddressMap.component'

type Channel = 'app' | 'whatsapp'

const EMPTY_FIELDS: DriverAddressFields = {
  city: '',
  district: '',
  number: '',
  postalCode: '',
  state: '',
  street: '',
}

/**
 * Spec 343 (T6a): o escritório digita o endereço correto da entrega e o manda ao motorista pelo chat do app e/ou pelo
 * grupo de WhatsApp dele. Nada é enviado sozinho: cada canal é um clique, e o resultado de um não depende do outro.
 */
type Props = Readonly<{
  companyId?: string
  occurrence: TripOccurrenceDetail
  permissions: readonly string[]
}>

/** A espera entre a última tecla e a busca do ponto do endereço novo. */
const POINT_LOOKUP_DEBOUNCE_MS = 900

type FoundPoint = Readonly<{
  key: string
  point: Readonly<{ latitude: number; longitude: number }>
}>

/** O ponto só se pede com o endereço completo; devolve a chave do endereço, ou `null` se falta algo. */
function completeAddressKey(fields: DriverAddressFields): null | string {
  const postal = fields.postalCode.replace(/\D/gu, '')
  const complete =
    postal.length === 8 &&
    fields.street.trim() !== '' &&
    fields.city.trim() !== '' &&
    fields.state.trim().length === 2
  return complete
    ? [postal, fields.street, fields.number, fields.district, fields.city, fields.state].join('|')
    : null
}

/**
 * O botão que abre o formulário mora na linha de ações do contato; o formulário **não**: ele abre abaixo
 * dessa linha, ocupando a largura do painel (a linha é flex e esticaria os botões vizinhos na altura dele,
 * e deixaria o mapa sem coluna).
 */
export function OccurrenceDriverAddressButton({
  onOpen,
}: Readonly<{ onOpen: () => void }>): JSX.Element {
  const { t } = useTranslation('trip')
  return (
    <Button onClick={onOpen} size="sm" type="button" variant="secondary">
      <Icon name="map-pin" />
      {t('occurrenceDetail.driverAddress.open')}
    </Button>
  )
}

/**
 * Spec 343 (T6a): o escritório digita o endereço correto da entrega e o manda ao motorista pelo chat do app e/ou pelo
 * grupo de WhatsApp dele. Nada é enviado sozinho: cada canal é um clique, e o resultado de um não depende do outro.
 * O mapa ao lado mostra o ponto original da parada e o do endereço novo, que se atualiza conforme o endereço se completa.
 */
export function OccurrenceDriverAddressEditor({
  companyId,
  occurrence,
  onClose,
  onSent,
  permissions,
}: Props & Readonly<{ onClose: () => void; onSent: (messageKey: string) => void }>): JSX.Element {
  const occurrenceId = occurrence.id
  const occurrenceKind = occurrence.source
  const { t } = useTranslation('trip')
  const [fields, setFields] = useState<DriverAddressFields>(EMPTY_FIELDS)
  const [foundPoint, setFoundPoint] = useState<FoundPoint | null>(null)
  const app = useSendDriverAppMessageMutation(occurrenceId)
  const whatsapp = useSendDriverAddressToWhatsAppGroup()
  const point = useFindDriverAddressPoint()
  /** A busca do mapa tem a própria mutation: não pode acender "Enviando…" nem travar os botões. */
  const mapLookup = useFindDriverAddressPoint()
  const mapData = useOccurrenceTripMapData({
    companyId,
    permissions,
    tripId: occurrence.tripId,
  })
  const originalPoint = useMemo(
    () =>
      resolveOccurrenceNoteStopPoint({
        occurrence: {
          stopLabel: occurrence.stopLabel,
          tripDocumentId: occurrence.document?.tripDocumentId ?? null,
        },
        stops: mapData.stops,
      }),
    [mapData.stops, occurrence.document?.tripDocumentId, occurrence.stopLabel],
  )
  const postalCode = usePostalCodeLookup<DriverAddressFields>({
    fields: { city: 'city', district: 'district', state: 'state', street: 'street' },
    patch: (values) => setFields((current) => ({ ...current, ...values })),
  })
  const text = composeDriverAddressText(fields)
  const isBusy = app.isPending || whatsapp.isPending || point.isPending
  const addressKey = completeAddressKey(fields)
  const { mutateAsync: lookupPoint } = mapLookup

  function change(key: keyof DriverAddressFields, value: string): void {
    setFields((current) => ({ ...current, [key]: value }))
  }

  function pointRequest() {
    return {
      ...fields,
      postalCode: fields.postalCode.replace(/\D/gu, ''),
      state: fields.state.trim().toUpperCase(),
    }
  }

  /** O mapa acompanha a digitação: com o endereço completo e parado por um instante, busca o ponto novo. */
  useEffect(() => {
    if (addressKey === null) return
    const request = pointRequest()
    let cancelled = false
    const timer = window.setTimeout(() => {
      lookupPoint(request)
        .then((found) => {
          if (cancelled) return
          setFoundPoint(found === null ? null : { key: addressKey, point: found })
        })
        .catch(() => {
          if (!cancelled) setFoundPoint(null)
        })
    }, POINT_LOOKUP_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pointRequest` lê `fields`, que `addressKey` já resume.
  }, [addressKey, lookupPoint])

  /** Sem ponto (ou sem resposta), o envio segue só com o texto. */
  async function findPoint() {
    if (addressKey === null) return undefined
    if (foundPoint?.key === addressKey) return foundPoint.point
    const found = await point.mutateAsync(pointRequest())
    return found ?? undefined
  }

  async function send(channel: Channel): Promise<void> {
    if (text.length === 0) return
    const found = await findPoint()
    if (channel === 'app') {
      app.mutate(
        {
          body: buildDriverAddressChatMessage(text, found),
          files: [],
          idempotencyKey: crypto.randomUUID(),
          uploaded: new Map(),
        },
        { onSuccess: () => onSent('occurrenceDetail.driverAddress.appSent') },
      )
      return
    }
    whatsapp.mutate(
      {
        addressText: text,
        occurrenceId,
        occurrenceKind,
        ...(found === undefined ? {} : found),
      },
      { onSuccess: () => onSent('occurrenceDetail.driverAddress.whatsappSent') },
    )
  }

  const visiblePoint =
    addressKey !== null && foundPoint?.key === addressKey ? foundPoint.point : null
  return (
    <div className={styles.driverAddressLayout}>
      <div className={styles.driverAddressForm}>
        <div className={styles.driverAddressGrid}>
          <label className={styles.driverAddressCep}>
            <span>{t('occurrenceDetail.driverAddress.postalCode')}</span>
            <input
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={9}
              onChange={(event) => {
                const value = formatPostalCode(event.target.value)
                change('postalCode', value)
                postalCode.lookup(value)
              }}
              placeholder="00000-000"
              value={fields.postalCode}
            />
          </label>
          <label className={styles.driverAddressNumber}>
            <span>{t('occurrenceDetail.driverAddress.number')}</span>
            <input
              maxLength={20}
              onChange={(event) => change('number', event.target.value)}
              value={fields.number}
            />
          </label>
          {postalCode.status === 'pending' ? (
            <p className={`${styles.hint} ${styles.driverAddressFull}`} role="status">
              {t('occurrenceDetail.driverAddress.postalCodeSearching')}
            </p>
          ) : null}
          {postalCode.status === 'missing' ? (
            <p className={`${styles.hint} ${styles.driverAddressFull}`} role="status">
              {t('occurrenceDetail.driverAddress.postalCodeMissing')}
            </p>
          ) : null}
          <label className={styles.driverAddressStreet}>
            <span>{t('occurrenceDetail.driverAddress.street')}</span>
            <input
              maxLength={120}
              onChange={(event) => change('street', event.target.value)}
              value={fields.street}
            />
          </label>
          <label className={styles.driverAddressDistrict}>
            <span>{t('occurrenceDetail.driverAddress.district')}</span>
            <input
              maxLength={60}
              onChange={(event) => change('district', event.target.value)}
              value={fields.district}
            />
          </label>
          <label className={styles.driverAddressCity}>
            <span>{t('occurrenceDetail.driverAddress.city')}</span>
            <input
              maxLength={60}
              onChange={(event) => change('city', event.target.value)}
              value={fields.city}
            />
          </label>
          <label className={styles.driverAddressState}>
            <span>{t('occurrenceDetail.driverAddress.state')}</span>
            <input
              maxLength={2}
              onChange={(event) => change('state', event.target.value.toUpperCase())}
              value={fields.state}
            />
          </label>
        </div>
        {text === '' ? null : (
          <p className={styles.hint}>
            {t('occurrenceDetail.driverAddress.preview', { address: text })}
          </p>
        )}
        <div className={styles.driverAddressActions}>
          <Button
            disabled={text.length === 0 || isBusy}
            onClick={() => void send('app')}
            size="sm"
            type="button"
          >
            <Icon name="send" />
            {t(
              app.isPending || point.isPending
                ? 'occurrenceDetail.driverAddress.sending'
                : 'occurrenceDetail.driverAddress.sendApp',
            )}
          </Button>
          <Button
            disabled={text.length === 0 || isBusy}
            onClick={() => void send('whatsapp')}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="message" />
            {t(
              whatsapp.isPending || point.isPending
                ? 'occurrenceDetail.driverAddress.sending'
                : 'occurrenceDetail.driverAddress.sendWhatsapp',
            )}
          </Button>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('occurrenceDetail.driverAddress.close')}
          </Button>
        </div>
        {app.isError ? (
          <p className={styles.alert} role="alert">
            {t('occurrenceDetail.driverAddress.appFailed')}
          </p>
        ) : null}
        {whatsapp.isError ? (
          <p className={styles.alert} role="alert">
            {t(`occurrenceDetail.driverAddress.${whatsappFailureKey(whatsapp.error)}`)}
          </p>
        ) : null}
      </div>
      <OccurrenceAddressMap newPoint={visiblePoint} originalPoint={originalPoint} />
    </div>
  )
}

/** O código da API vira a mensagem; o motivo fechado do Evolution não chega aqui, então "falhou" cobre o resto. */
export function whatsappFailureKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'DRIVER_WHATSAPP_GROUP_MISSING') return 'whatsappNoGroup'
  if (code === 'WHATSAPP_EVOLUTION_DISABLED' || code === 'WHATSAPP_EVOLUTION_NOT_CONFIGURED') {
    return 'whatsappDisconnected'
  }
  return 'whatsappFailed'
}
