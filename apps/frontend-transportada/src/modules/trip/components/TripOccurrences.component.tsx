/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { loadTripOccurrenceAttachments } from '../queries/tripOccurrenceFeed.query'
import { resolveFieldAuthorshipText } from '../shared/fieldAuthorship.service'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
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
  OCCURRENCE_NOTE_LIMIT,
  OCCURRENCE_NOTE_PRESET_IDS,
  resolveOccurrenceNoteCounter,
} from '../shared/occurrenceNotePreset.service'
import styles from '../styles/trip.module.css'

type TripOccurrencesProps = Readonly<{
  canRegister: boolean
  /** O e-mail que o último registro produziu, para o operador conferir e enviar. */
  email: null | Readonly<{ body: string; subject: string }>
  /**
   * Revisão de design spec 161: `SeparationOccurrenceDialog` hospeda este formulário dentro do
   * molde `.mdfeGateDialog`/`.mdfeGateFooter` (rodapé sticky) que todo outro diálogo de viagem usa;
   * `TripDetail` e `TripOccurrencesWorkspace` renderizam o mesmo componente **fora** de diálogo, no
   * corpo normal da página, onde um rodapé fixo à tela não faz sentido — o rodapé sticky só nasce
   * quando `isDialog` é `true`.
   */
  isDialog?: boolean
  isRegistering: boolean
  occurrences: readonly TripOccurrence[]
  /**
   * Revisão de UX (spec 161): reporta se há foto ou observação em progresso — o diálogo hospedeiro
   * usa isto para confirmar antes de descartar pelo X do cabeçalho (que não vê o estado interno
   * deste formulário). Só `SeparationOccurrenceDialog` passa a prop; fora de diálogo não há X a
   * proteger.
   */
  onDirtyChange?: (isDirty: boolean) => void
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
  isDialog = false,
  isRegistering,
  occurrences,
  onDirtyChange,
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
  /** Revisão de UX (spec 161): Cancelar também confirma quando há foto ou observação em progresso. */
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false)
  const canSubmit = occurrenceTypeId !== '' && canSubmitOccurrenceWithPhotos(photos.length)
  const noteCounter = resolveOccurrenceNoteCounter(note)
  const hasFailedPhoto = hasOccurrencePhotoSendFailure(photoSendState)
  const isDirty = photos.length > 0 || note.trim() !== ''

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  function clearForm() {
    setNote('')
    setProductCode('')
    setPhotos([])
    setIsConfirmingCancel(false)
    setIsOpen(false)
  }

  function handleCancelClick(): void {
    if (isDirty && !isConfirmingCancel) {
      setIsConfirmingCancel(true)
      return
    }
    onReset()
    setIsOpen(false)
    clearForm()
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
                    onRefresh={() => loadTripOccurrenceAttachments(occurrence.id)}
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
      {/*
       * Revisão de UX (spec 161): a ordem virou tipo → item → **foto** → observação. A foto é
       * obrigatória (CA17) e começava fora da dobra em 390px porque vinha depois do textarea de
       * quatro linhas e das frases prontas, todas opcionais — quem preenche em pé via primeiro os
       * campos que pode pular, e só rolando bastante chegava no único bloco que trava o envio.
       */}
      {canRegister && isOpen ? (
        <div className={styles.occurrenceForm}>
          {/* Tipo + item lado a lado do tablet para cima (revisão spec 161, item 11) — mesmo
              padrão de `.cargoMeasures`: o diálogo tem 38rem de largura no desktop, e uma coluna
              só desperdiçava metade dela num par de campos curtos. */}
          <div className={styles.occurrenceFormRow}>
            <label>
              <span>{t('occurrence.typeLabel')}</span>
              <Select
                ariaLabel={t('occurrence.typeLabel')}
                onChange={setOccurrenceTypeId}
                options={disponiveis.map((type) => ({ label: type.name, value: type.id }))}
                value={occurrenceTypeId}
              />
            </label>
            <label>
              <span>{t('occurrence.product')}</span>
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
            </label>
          </div>
          {/* Marcador de obrigatório (item 7 da revisão): a única seção que de fato trava o envio
              (CA17) ganha o mesmo `*` que o resto do produto usa para campo obrigatório. */}
          <p className={styles.occurrencePhotoSectionLabel}>
            {t('occurrence.photoPicker.sectionLabel')}
            <span aria-hidden="true"> *</span>
          </p>
          <OccurrencePhotoPicker disabled={isRegistering} onChange={setPhotos} photos={photos} />
          {/*
           * B2 (revisão spec 161): progresso por foto — o operador vê qual foto está indo, qual já
           * foi e qual falhou (com o motivo), em vez de um resultado só para o lote inteiro. Cada
           * item usa `.alert`/`.hint` conforme o status muda ou não o fluxo (item 8 da revisão).
           */}
          {photoSendState.length === 0 ? null : (
            <ul className={styles.occurrencePhotoSendStatus} role="status">
              {photoSendState.map((item, index) => (
                <li
                  className={item.status === 'failed' ? styles.alert : styles.hint}
                  key={item.photoId}
                >
                  {t('occurrence.sendStatus.photoLabel', { position: index + 1 })}
                  {': '}
                  {t(`occurrence.sendStatus.${item.status}`)}
                  {/*
                   * O motivo sai traduzido, não como código cru: a recusa do servidor por tipo ou
                   * tamanho (o PDF tem teto próprio) é a que o operador mais vê, e
                   * `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE` na tela não diz o que fazer a seguir.
                   */}
                  {item.status === 'failed' && item.error !== undefined
                    ? ` — ${t(`feedback.${resolveTripFeedbackKey(new Error(item.error)) ?? 'requestFailed'}`)}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
          <label>
            <span>{t('occurrence.noteLabel')}</span>
            {/* `field-sizing: content` (item 1 da revisão) deixa o campo nascer em duas linhas e
                crescer com o texto — sem isto quatro linhas fixas de observação (opcional) somadas
                à foto empurravam o rodapé para fora da tela em 390px. */}
            <textarea
              className={styles.occurrenceNoteField}
              maxLength={OCCURRENCE_NOTE_LIMIT}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              value={note}
            />
          </label>
          {/* O limite é do servidor (`z.string().trim().max(500)`): sem contador, o operador só
              descobriria no envio, com a foto já tirada. */}
          <p className={noteCounter.isNearLimit ? styles.occurrenceNoteCounterNear : styles.hint}>
            {t('occurrence.noteCounter', {
              limit: noteCounter.limit,
              used: noteCounter.used,
            })}
          </p>
          {/*
           * Frases prontas atrás de um `<details>` fechado (item 1 da revisão): sete botões de
           * alvo de toque cheio empurravam a foto — que é obrigatória — para baixo deles, que são
           * opcionais. `<details>` é o mesmo primitivo nativo já usado em `DriverStopCard`
           * (`proofPendingWarningDetails`) para disclosure sem trazer um componente novo.
           */}
          <details className={styles.occurrenceNotePresetsDetails}>
            <summary>
              {t('occurrence.notePresetsToggle', { count: OCCURRENCE_NOTE_PRESET_IDS.length })}
            </summary>
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
          </details>
        </div>
      ) : null}
      {/*
       * Rodapé fixo do diálogo (revisão spec 161): registrar/reenviar/cancelar ficam sempre
       * alcançáveis — antes caíam abaixo da dobra, dentro do `.occurrenceForm` que rola com o
       * corpo. `.mdfeGateFooter` é o mesmo rodapé sticky que todo outro diálogo de viagem usa
       * (`TripCancelDialog`, `TripCloseDialog`, …); este diálogo era o único que não o tinha. Fora
       * de diálogo (`isDialog` falso) as mesmas ações ficam em `.occurrenceFormActions`, sem sticky.
       *
       * Item 7 da revisão: "Adicione ao menos uma foto…" mora aqui agora, ao lado do botão que ela
       * explica — não solta no meio do formulário, longe de onde o operador olha antes de tocar
       * Registrar. Item 10: Registrar por último/à direita (ação primária, onde o polegar destro
       * chega por último no gesto de rolar), Cancelar em `ghost` mais afastado, Reenviar em
       * `secondary` — três pesos, não dois botões escuros competindo.
       */}
      {canRegister && isOpen ? (
        <footer className={isDialog ? styles.mdfeGateFooter : styles.occurrenceFormActions}>
          {photos.length === 0 ? (
            <p className={styles.occurrenceFooterHint} role="alert">
              {t('occurrence.photoPicker.noPhoto')}
            </p>
          ) : null}
          {isConfirmingCancel ? (
            <>
              <p className={styles.occurrenceFooterHint}>{t('occurrence.cancelConfirmBody')}</p>
              <Button
                onClick={() => setIsConfirmingCancel(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="close" />
                {t('occurrence.cancelConfirmContinue')}
              </Button>
              <Button onClick={handleCancelClick} size="sm" type="button" variant="secondary">
                <Icon name="trash" />
                {t('occurrence.cancelConfirmDiscard')}
              </Button>
            </>
          ) : (
            <Button onClick={handleCancelClick} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('occurrence.cancel')}
            </Button>
          )}
          {hasFailedPhoto ? (
            <Button
              disabled={isRegistering}
              onClick={() => void handleRetryFailed()}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="save" />
              {t('occurrence.sendStatus.retry')}
            </Button>
          ) : null}
          <Button
            disabled={isRegistering || !canSubmit}
            onClick={() => void handleSubmit()}
            size="sm"
            type="button"
          >
            <Icon name="save" />
            {t('occurrence.submit')}
          </Button>
        </footer>
      ) : null}
    </>
  )
}
