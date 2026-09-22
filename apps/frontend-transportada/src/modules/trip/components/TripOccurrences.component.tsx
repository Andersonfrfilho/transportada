/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { resolveFieldAuthorshipText } from '../shared/fieldAuthorship.service'
import { TRIP_OCCURRENCE_STAGE } from '../shared/occurrence.constant'
import type { OccurrenceType } from '../shared/occurrence.constant'
import { canSubmitOccurrenceWithPhotos } from '../shared/occurrencePhotoPicker.service'
import {
  hasOccurrencePhotoSendFailure,
  type OccurrencePhotoSendItem,
} from '../shared/occurrencePhotoSend.service'
import type { TripDocumentProduct, TripOccurrence } from '../shared/trip.types'
import { OccurrenceAttachmentGrid } from './OccurrenceAttachmentGrid.component'
import { OccurrencePhotoPicker, type OccurrencePhoto } from './OccurrencePhotoPicker.component'
import {
  appendOccurrenceNotePreset,
  OCCURRENCE_NOTE_PRESET_IDS,
} from '../shared/occurrenceNotePreset.service'
import styles from '../styles/trip.module.css'

type TripOccurrencesProps = Readonly<{
  canRegister: boolean
  /** O e-mail que o último registro produziu, para o operador conferir e enviar. */
  email: null | Readonly<{ body: string; subject: string }>
  isRegistering: boolean
  occurrences: readonly TripOccurrence[]
  /**
   * B1 (revisão spec 161): zera a sessão de envio de fotos do hook
   * (`resetSeparationOccurrencePhotoSend`) — sem isto, a segunda ocorrência de separação na mesma
   * sessão reusava o `occurrenceId` da primeira e as fotos dela viravam anexo da ocorrência errada.
   */
  onReset: () => void
  /**
   * B2 (revisão spec 161): devolve `hasFailure` porque o envio é **sequencial por foto** e não
   * lança na falha de uma foto (`sendOccurrencePhotosSequentially` sempre resolve) — sem o retorno,
   * o formulário não tinha como saber que precisa continuar aberto para o operador reenviar só o
   * que falhou.
   */
  onRegister: (input: {
    readonly note: string
    readonly occurrenceTypeId: string
    readonly photos: readonly OccurrencePhoto[]
    readonly productCode: string
  }) => Promise<Readonly<{ hasFailure: boolean }>>
  /** Estado por foto do envio em curso/do último tentado — vazio quando nada foi enviado ainda. */
  photoSendState: readonly OccurrencePhotoSendItem[]
  products: readonly TripDocumentProduct[]
  types: readonly OccurrenceType[]
}>

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Spec 079: o que houve com a carga.
 *
 * ⚠️ **A ocorrência só anota** — não muda o estado da nota, não bloqueia despacho. Misturar os dois
 * eixos deixaria a nota travada num estado que ninguém sabe destravar.
 *
 * ⚠️ **A tela oferece só os tipos de galpão**, e ativos: a ocorrência de rua é `trip.report` e mora
 * na árvore do motorista; oferecê-la aqui produziria um botão que sempre responde 403. Tipo
 * aposentado sai da lista de escolha, mas o que já foi registrado com ele continua legível.
 *
 * ⚠️ **O item é opcional, e "a nota inteira" é o padrão**: recusa total não tem item a apontar, e
 * obrigar a escolher faria quem registra escolher qualquer um.
 */
export function TripOccurrences({
  canRegister,
  email,
  isRegistering,
  occurrences,
  onRegister,
  onReset,
  photoSendState,
  products,
  types,
}: TripOccurrencesProps) {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const disponiveis = types.filter(
    (type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.separation,
  )
  const [occurrenceTypeId, setOccurrenceTypeId] = useState(disponiveis[0]?.id ?? '')
  const [productCode, setProductCode] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<readonly OccurrencePhoto[]>([])
  const canSubmit = occurrenceTypeId !== '' && canSubmitOccurrenceWithPhotos(photos.length)
  const hasFailedPhoto = hasOccurrencePhotoSendFailure(photoSendState)

  function clearForm() {
    setNote('')
    setProductCode('')
    setPhotos([])
    setIsOpen(false)
  }

  /**
   * B2 (revisão spec 161): o envio não lança na falha de uma foto — ele resolve sempre, marcando o
   * item como `failed` no estado do hook. Limpar/fechar o formulário aqui **antes** de saber o
   * resultado perdia os `Blob` das fotos que ainda não foram, sem jeito de reenviar só elas. Agora
   * o formulário só fecha quando `hasFailure` volta `false` — com falha, ele continua aberto com as
   * mesmas fotos, e o botão de reenvio (abaixo) chama `onRegister` de novo sem `onReset`, para o
   * hook retomar a mesma fila pelo que ainda não foi `sent`.
   */
  async function handleSubmit() {
    if (!canSubmit) return
    onReset()
    const result = await onRegister({ note, occurrenceTypeId, photos, productCode })
    if (!result.hasFailure) clearForm()
  }

  async function handleRetryFailed() {
    const result = await onRegister({ note, occurrenceTypeId, photos, productCode })
    if (!result.hasFailure) clearForm()
  }

  return (
    <>
      <h4 className={styles.hint}>{t('occurrence.title')}</h4>
      {occurrences.length === 0 ? (
        <p className={styles.hint}>{t('occurrence.none')}</p>
      ) : (
        <ul className={styles.documentProductList}>
          {occurrences.map((occurrence) => {
            const authorship = resolveFieldAuthorshipText(occurrence, t as Translate)
            return (
              <li key={occurrence.id}>
                {t('occurrence.line', {
                  moment: momentFormatter.format(new Date(occurrence.createdAt)),
                  type: occurrence.typeName,
                })}
                {occurrence.productCode === ''
                  ? ` — ${t('occurrence.wholeDocument')}`
                  : ` — ${occurrence.productCode}`}
                {occurrence.note === '' ? null : ` — ${occurrence.note}`}
                {authorship === null ? null : <span className={styles.hint}> — {authorship}</span>}
                {occurrence.attachments === undefined ||
                occurrence.attachments.length === 0 ? null : (
                  <OccurrenceAttachmentGrid
                    attachments={occurrence.attachments}
                    occurrenceCreatedAt={occurrence.createdAt}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
      {/*
       * ⚠️ O e-mail volta **pronto para conferir e enviar**, não enviado: o destinatário é externo,
       * e mandar em nome da transportadora é decisão que ainda não foi tomada. O que isto resolve é
       * o retrabalho de escrever à mão — que é onde o número da nota entra trocado.
       */}
      {email === null ? null : (
        <div className={styles.occurrenceForm}>
          <p className={styles.hint}>{t('occurrence.emailReady')}</p>
          <strong>{email.subject}</strong>
          <pre className={styles.occurrenceEmail}>{email.body}</pre>
        </div>
      )}
      {canRegister && disponiveis.length > 0 && !isOpen ? (
        <Button
          onClick={() => {
            onReset()
            setIsOpen(true)
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="alert" />
          {t('occurrence.register')}
        </Button>
      ) : null}
      {canRegister && isOpen ? (
        <div className={styles.occurrenceForm}>
          <Select
            ariaLabel={t('occurrence.title')}
            onChange={setOccurrenceTypeId}
            options={disponiveis.map((type) => ({ label: type.name, value: type.id }))}
            value={occurrenceTypeId}
          />
          <Select
            ariaLabel={t('occurrence.product')}
            onChange={setProductCode}
            options={[
              { label: t('occurrence.wholeDocument'), value: '' },
              ...products.map((product) => ({
                label: `${product.code} — ${product.description}`,
                value: product.code,
              })),
            ]}
            value={productCode}
          />
          <textarea
            aria-label={t('occurrence.noteLabel')}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('occurrence.noteLabel')}
            rows={4}
            value={note}
          />
          {/* Frases prontas: o botão escreve a frase inteira e o texto continua editável — quem
              separa registra em pé, no celular do galpão. */}
          <p className={styles.hint}>{t('occurrence.notePresetsHint')}</p>
          <div className={styles.occurrenceNotePresets}>
            {OCCURRENCE_NOTE_PRESET_IDS.map((presetId) => {
              const preset = t(`occurrence.notePresets.${presetId}`)
              return (
                <Button
                  key={presetId}
                  onClick={() => setNote(appendOccurrenceNotePreset({ note, preset }))}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Icon name="add" />
                  {preset}
                </Button>
              )
            })}
          </div>
          <OccurrencePhotoPicker disabled={isRegistering} onChange={setPhotos} photos={photos} />
          {/* CA17: sem foto o envio fica desabilitado, e o motivo fica visível — nunca só o botão
              cinza sem explicação. */}
          {photos.length === 0 ? (
            <p className={styles.hint} role="alert">
              {t('occurrence.photoPicker.noPhoto')}
            </p>
          ) : null}
          {/*
           * B2 (revisão spec 161): progresso por foto — o operador vê qual foto está indo, qual já
           * foi e qual falhou (com o motivo), em vez de um resultado só para o lote inteiro.
           */}
          {photoSendState.length === 0 ? null : (
            <ul className={styles.hint} role="status">
              {photoSendState.map((item, index) => (
                <li key={item.photoId}>
                  {t('occurrence.sendStatus.photoLabel', { position: index + 1 })}
                  {': '}
                  {t(`occurrence.sendStatus.${item.status}`)}
                  {item.status === 'failed' && item.error !== undefined ? ` — ${item.error}` : ''}
                </li>
              ))}
            </ul>
          )}
          <Button
            disabled={isRegistering || !canSubmit}
            onClick={() => void handleSubmit()}
            size="sm"
            type="button"
          >
            <Icon name="save" />
            {t('occurrence.submit')}
          </Button>
          {hasFailedPhoto ? (
            <Button
              disabled={isRegistering}
              onClick={() => void handleRetryFailed()}
              size="sm"
              type="button"
            >
              <Icon name="save" />
              {t('occurrence.sendStatus.retry')}
            </Button>
          ) : null}
          <Button
            onClick={() => {
              onReset()
              setIsOpen(false)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
            {t('occurrence.cancel')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
