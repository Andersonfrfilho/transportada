/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { BarcodeScanner, type BarcodeScannerFeedback } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { MeasurementCardPrint } from './MeasurementCardPrint.component'
import { PackageBoxCameraFlow } from './PackageBoxCameraFlow.component'
import { PackageBoxMeasurementForm } from './PackageBoxMeasurementForm.component'
import {
  PACKAGE_BOX_STATUS_FILTERS,
  type PackageBox,
  type PackageBoxMeasurementInput,
  type PackageBoxQueue,
  type PackageBoxStatusFilter,
} from '../shared/packageBoxClient.service'
import { toCentimetres } from '../shared/packageBoxMeasurementUnits.service'
import styles from '../styles/packageBoxes.module.css'

type PackageBoxMeasurementPanelProps = Readonly<{
  /** Spec 152 D14: sem ela ligada, a etapa Medida não existe — só "Digitar medida". */
  cameraMeasurementEnabled: boolean
  denied: boolean
  failed: boolean
  loading: boolean
  /** `true` enquanto a fila reconsulta a API por causa de um bipe — não o carregamento inicial. */
  matching: boolean
  onMeasure: (input: PackageBoxMeasurementInput) => void
  onStatusChange: (status: PackageBoxStatusFilter) => void
  onScan: (text: string) => void
  onSearchChange: (search: string) => void
  queue: PackageBoxQueue | null
  saving: boolean
  search: string
  status: PackageBoxStatusFilter
}>

const FOUND_FEEDBACK_DELAY_MS = 900
const NOT_FOUND_FEEDBACK_DELAY_MS = 2500
/** Acima do teto, a lista não cresce — refinar a busca é mais rápido que rolar dezenas de linhas. */
const MAX_CANDIDATES_SHOWN = 8
const CANDIDATES_TITLE_ID = 'package-box-candidates-title'

/** GTIN-8/12/13/14: só dígitos, no comprimento fixo dos padrões de código de barras de produto. */
const SCANNED_CODE_LENGTHS = new Set([8, 12, 13, 14])
/** Chave de acesso da NF-e/CT-e: 44 posições, UF+ano/mês+CNPJ fixos numéricos, dígito verificador. */
const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/

/**
 * ⚠️ Diferencia a pistola de código de barras (digita rápido e manda Enter) de alguém digitando uma
 * busca de texto normal. Sem essa forma o valor cai no filtro por `ilike`, e a pistola nunca acha a
 * caixa pela chave da nota nem pelo GTIN — o defeito que esta heurística existe para fechar.
 */
function looksLikeScannedCode(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return false
  if (/^[0-9]+$/.test(trimmed)) return SCANNED_CODE_LENGTHS.has(trimmed.length)
  return ACCESS_KEY_PATTERN.test(trimmed)
}

const PERCENT_SCALE = 100

/**
 * R5 (leitura): a linha já medida mostra de onde a medida veio — "pela câmera, ±X cm", "digitada"
 * ou "origem não registrada" para o que foi medido antes desta spec (D8, `measurementSource: null`).
 */
function measurementSourceLabel(
  t: ReturnType<typeof useTranslation<'nfeWorkspace'>>['t'],
  box: PackageBox,
): string {
  if (box.measurementSource === null) return t('packageBoxes.source.unknown')
  if (box.measurementSource === 'typed') return t('packageBoxes.source.typed')
  return t('packageBoxes.source.camera', {
    margin: box.measurementMarginMm === null ? 0 : box.measurementMarginMm / 10,
  })
}

function QueueSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <SkeletonGroup label={t('packageBoxes.title')}>
      <Skeleton variant="text" width="16rem" />
      <Skeleton variant="text" width="70%" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton height="var(--field-height)" key={row} width="100%" />
      ))}
    </SkeletonGroup>
  )
}

/**
 * A fila de medição do conferente (spec 085 G005). Mobile-first porque ela é usada de pé no galpão,
 * com o celular numa mão e a fita na outra.
 *
 * ⚠️ A cobertura aparece por linha: sem ela a tela é uma lista longa em que ninguém sabe onde parar
 * de descer — doze caixas cobrem um quarto do que sai daqui, e as de baixo custam o mesmo tempo.
 */
export function PackageBoxMeasurementPanel({
  cameraMeasurementEnabled,
  denied,
  failed,
  loading,
  matching,
  onMeasure,
  onScan,
  onSearchChange,
  onStatusChange,
  queue,
  saving,
  search,
  status,
}: PackageBoxMeasurementPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [editingId, setEditingId] = useState<null | string>(null)
  /**
   * ⚠️ Quem chegou pela câmera volta para ela depois de gravar: o conferente mede uma pilha inteira
   * de caixas seguidas, e obrigá-lo a tocar "Ler etiqueta" a cada uma quebra o ciclo com a fita na
   * outra mão. Quem chegou digitando fica na busca — ali ele está procurando, não varrendo.
   */
  const [cameFromScan, setCameFromScan] = useState(false)
  /**
   * ⚠️ Equivalente ao `cameFromScan` da câmera, mas para a pistola física (USB/Bluetooth que
   * "digita" o código e manda Enter): quem bipou pela pistola volta o foco ao campo de busca ao
   * gravar, não abre a câmera — o ciclo de pilha de caixas é o mesmo, o retorno é outro.
   */
  const [cameFromKeyboardScan, setCameFromKeyboardScan] = useState(false)
  const [scanFeedback, setScanFeedback] = useState<BarcodeScannerFeedback | undefined>(undefined)
  /** `true` do bipe até a fila responder — é o sinal que diz quando avaliar achou/não achou. */
  const [awaitingScan, setAwaitingScan] = useState(false)
  /**
   * ⚠️ Ref, não estado: só decide o destino de `openMeasurementForScannedBox` (câmera ou pistola),
   * nunca dispara render sozinho — o `awaitingScan` já cuida disso.
   */
  const scanOriginRef = useRef<'camera' | 'keyboard'>('camera')
  const searchInputRef = useRef<HTMLInputElement>(null)
  /**
   * ⚠️ Mais de uma caixa achada nunca escolhe sozinha (o GTIN ainda não é gravado nas caixas — só
   * chave de acesso e código de produto casam hoje, e o segundo é ambíguo entre emitentes). A lista
   * mora aqui, não no `queue`: ela é o resultado de **um** bipe, e a fila recarrega por outros
   * motivos (troca de situação, busca) que não devem reabrir a escolha.
   */
  const [candidates, setCandidates] = useState<readonly PackageBox[] | null>(null)
  const closeScanTimer = useRef<number | undefined>(undefined)
  /**
   * Spec 152 T11: `PackageBoxCameraFlow` é a porta de entrada da medida pela câmera — dona da
   * própria sessão (`useCameraStream`, D19), separada do leitor digitado de hoje. Aberta, ela casa
   * a etiqueta com a fila pela mesma pergunta (`onScan`/`matching`/`queue`), então o efeito abaixo
   * (que abre a edição digitada / a lista de candidatas) precisa ficar de fora enquanto ela decide.
   */
  const [isCameraFlowOpen, setIsCameraFlowOpen] = useState(false)
  const [isPrintCardOpen, setIsPrintCardOpen] = useState(false)

  useEffect(() => {
    return () => window.clearTimeout(closeScanTimer.current)
  }, [])

  /**
   * ⚠️ Ponto de entrada isolado de propósito: quando a medição por câmera (spec em andamento)
   * chegar, ela entra por aqui — bipar já leva direto à edição da caixa achada, só falta o
   * formulário de medida também vir da câmera em vez do teclado.
   */
  function openMeasurementForScannedBox(id: string): void {
    setScanFeedback({ kind: 'found', message: t('packageBoxes.scanner.found') })
    setEditingId(id)
    if (scanOriginRef.current === 'keyboard') {
      setCameFromKeyboardScan(true)
    } else {
      setCameFromScan(true)
    }
    closeScanTimer.current = window.setTimeout(() => {
      setIsScannerOpen(false)
      setScanFeedback(undefined)
    }, FOUND_FEEDBACK_DELAY_MS)
  }

  /**
   * A resposta da fila chegou: uma caixa, abre a medição dela; nenhuma, segue lendo; mais de uma —
   * o GTIN ainda não está gravado, então a etiqueta pode casar com caixas de emitentes diferentes —
   * o operador escolhe, nunca a tela.
   */
  useEffect(() => {
    if (isCameraFlowOpen) return
    if (!awaitingScan || matching) return
    setAwaitingScan(false)
    const items = queue?.items ?? []
    if (items.length === 0) {
      setScanFeedback({ kind: 'notFound', message: t('packageBoxes.scanner.notFound') })
      return
    }
    if (items.length > 1) {
      setCandidates(items)
      return
    }
    const [match] = items
    if (match !== undefined) openMeasurementForScannedBox(match.id)
  }, [awaitingScan, isCameraFlowOpen, matching, queue, t, openMeasurementForScannedBox])

  useEffect(() => {
    if (scanFeedback?.kind !== 'notFound') return
    const timer = window.setTimeout(() => setScanFeedback(undefined), NOT_FOUND_FEEDBACK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [scanFeedback])

  const scanner = (
    <BarcodeScanner
      closeLabel={t('packageBoxes.scanner.close')}
      deniedMessage={t('packageBoxes.scanner.denied')}
      feedback={scanFeedback}
      isOpen={isScannerOpen}
      onClose={() => {
        window.clearTimeout(closeScanTimer.current)
        setIsScannerOpen(false)
        setScanFeedback(undefined)
        setAwaitingScan(false)
        setCandidates(null)
      }}
      onRead={(text) => {
        scanOriginRef.current = 'camera'
        setScanFeedback(undefined)
        setAwaitingScan(true)
        onScan(text)
      }}
      readingMessage={t('packageBoxes.scanner.reading')}
      startingMessage={t('packageBoxes.scanner.starting')}
      title={t('packageBoxes.scanner.title')}
      unavailableMessage={t('packageBoxes.scanner.unavailable')}
    />
  )

  if (denied)
    return (
      <>
        {scanner}
        <p className={styles.notice}>{t('packageBoxes.denied')}</p>
      </>
    )
  if (loading)
    return (
      <>
        {scanner}
        <QueueSkeleton />
      </>
    )
  if (failed)
    return (
      <>
        {scanner}
        <p className={styles.notice}>{t('packageBoxes.failed')}</p>
      </>
    )

  const items = queue?.items ?? []

  return (
    <section aria-labelledby="package-boxes-title" className={styles.panel}>
      <header className={styles.header}>
        <h3 id="package-boxes-title">{t('packageBoxes.title')}</h3>
        <p className={styles.hint}>{t('packageBoxes.description')}</p>
        <Button onClick={() => setIsPrintCardOpen(true)} size="sm" type="button" variant="ghost">
          <Icon name="download" />
          {t('packageBoxes.printCard.open')}
        </Button>
      </header>

      <div className={styles.search}>
        <label className={styles.field} htmlFor="package-box-search">
          {t('packageBoxes.searchLabel')}
          <input
            id="package-box-search"
            inputMode="search"
            onChange={(event) => {
              setCameFromScan(false)
              setCameFromKeyboardScan(false)
              onSearchChange(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              const value = event.currentTarget.value
              /** Digitação normal segue filtrando texto — só o formato de código vira bipe. */
              if (!looksLikeScannedCode(value)) return
              event.preventDefault()
              scanOriginRef.current = 'keyboard'
              setScanFeedback(undefined)
              setAwaitingScan(true)
              onScan(value)
            }}
            placeholder={t('packageBoxes.searchPlaceholder')}
            ref={searchInputRef}
            type="search"
            value={search}
          />
        </label>
        <Button onClick={() => setIsScannerOpen(true)} type="button" variant="secondary">
          <Icon name="camera" />
          {t('packageBoxes.scan')}
        </Button>
        {cameraMeasurementEnabled ? (
          <Button onClick={() => setIsCameraFlowOpen(true)} type="button" variant="secondary">
            <Icon name="camera" />
            {t('packageBoxes.camera.openFlow')}
          </Button>
        ) : null}
      </div>

      <label className={styles.field} htmlFor="package-box-status">
        {t('packageBoxes.statusLabel')}
        <Select
          ariaLabel={t('packageBoxes.statusLabel')}
          onChange={(value) => onStatusChange(value as PackageBoxStatusFilter)}
          options={PACKAGE_BOX_STATUS_FILTERS.map((filter) => ({
            label: t(`packageBoxes.status.${filter}`),
            value: filter,
          }))}
          value={status}
        />
      </label>

      {items.length === 0 ? (
        <p className={styles.notice}>{t('packageBoxes.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((box) => (
            <PackageBoxRow
              box={box}
              isEditing={editingId === box.id}
              key={`${box.id}:${box.measuredAt ?? 'sem-medida'}`}
              onCancel={() => setEditingId(null)}
              onMeasure={(measurement) => {
                onMeasure({ ...measurement, id: box.id })
                setEditingId(null)
                if (cameFromScan) setIsScannerOpen(true)
                if (cameFromKeyboardScan) {
                  setCameFromKeyboardScan(false)
                  searchInputRef.current?.focus()
                }
              }}
              onOpen={() => setEditingId(box.id)}
              saving={saving}
            />
          ))}
        </ul>
      )}

      {scanner}

      {candidates === null ? null : (
        <PackageBoxCandidatePicker
          candidates={candidates}
          onBack={() => setCandidates(null)}
          onSelect={(id) => {
            setCandidates(null)
            openMeasurementForScannedBox(id)
          }}
        />
      )}

      <PackageBoxCameraFlow
        cameraEnabled={cameraMeasurementEnabled}
        isOpen={isCameraFlowOpen}
        matches={queue?.items}
        matching={matching}
        onClose={() => setIsCameraFlowOpen(false)}
        onLookup={(text) => onScan(text)}
        onSave={(id, submission) => onMeasure({ ...submission, id })}
      />

      <MeasurementCardPrint isOpen={isPrintCardOpen} onClose={() => setIsPrintCardOpen(false)} />
    </section>
  )
}

type PackageBoxCandidatePickerProps = Readonly<{
  candidates: readonly PackageBox[]
  onBack: () => void
  onSelect: (id: string) => void
}>

/**
 * O GTIN ainda não é gravado nas caixas (chega com o pacote fiscal numa etapa seguinte) — hoje só
 * chave de acesso e código de produto casam a etiqueta, e o segundo pode achar a mesma caixa em
 * emitentes diferentes. Escolher sozinho aqui seria adivinhar; quem decide é o operador, tocando na
 * candidata certa. A camada nasce sobre o leitor, nunca inline — a mesma razão que abre o próprio
 * `BarcodeScanner` em portal: o conferente está de pé, com o celular numa mão.
 */
function PackageBoxCandidatePicker({
  candidates,
  onBack,
  onSelect,
}: PackageBoxCandidatePickerProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: onBack })
  const total = candidates.length
  const shown = candidates.slice(0, MAX_CANDIDATES_SHOWN)

  /** Foco no primeiro item, não no contêiner: quem chegou aqui vai tocar ou apertar Enter direto. */
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[data-candidate] button')?.focus()
  }, [dialogRef])

  return createPortal(
    <div className={styles.candidatesOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={CANDIDATES_TITLE_ID}
        aria-modal="true"
        className={styles.candidatesDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.candidatesHead}>
          <h3 className={styles.candidatesTitle} id={CANDIDATES_TITLE_ID}>
            {t('packageBoxes.scanner.candidates.title')}
          </h3>
          <Button
            aria-label={t('packageBoxes.scanner.candidates.back')}
            onClick={onBack}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        <p className={styles.hint}>{t('packageBoxes.scanner.candidates.hint')}</p>
        <ul className={styles.candidatesList}>
          {shown.map((box, index) => (
            <li data-candidate key={box.id}>
              <Button
                className={styles.candidateButton}
                onClick={() => onSelect(box.id)}
                type="button"
                variant="secondary"
              >
                <span className={styles.candidateMain}>
                  <strong>{box.description || box.productCode}</strong>
                  <span className={styles.unit}>{box.emitterTaxId}</span>
                </span>
                <span className={styles.hint}>
                  {t('packageBoxes.scanner.candidates.position', { position: index + 1, total })}
                  {box.measuredAt === null ? null : (
                    <>
                      {' · '}
                      <span className={styles.candidateMeasured}>
                        {t('packageBoxes.scanner.candidates.measured')}
                      </span>
                    </>
                  )}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {total > MAX_CANDIDATES_SHOWN ? (
          <p className={styles.notice}>
            {t('packageBoxes.scanner.candidates.overflow', { shown: shown.length, total })}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

type PackageBoxRowProps = Readonly<{
  box: PackageBox
  isEditing: boolean
  onCancel: () => void
  onMeasure: (input: PackageBoxMeasurementInput) => void
  onOpen: () => void
  saving: boolean
}>

function PackageBoxRow({
  box,
  isEditing,
  onCancel,
  onMeasure,
  onOpen,
  saving,
}: PackageBoxRowProps) {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <li className={styles.item} data-within-coverage={box.withinCoverage}>
      <div className={styles.itemHeader}>
        <strong>{box.description || box.productCode}</strong>
        <span className={styles.unit}>{box.commercialUnit}</span>
      </div>
      {/*
        ⚠️ O acumulado e a marca de cobertura só valem para o que **falta** medir: eles respondem
        "até onde vale descer a fila". Na caixa já medida eles anunciariam uma decisão que não
        existe mais, e é a medida dela que interessa ali.
      */}
      <p className={styles.hint}>
        {t('packageBoxes.transported', { count: box.transportedVolumes })}
        {box.measuredAt !== null ? null : (
          <>
            {' · '}
            {t('packageBoxes.cumulative', {
              percent: Math.round(box.cumulativeShare * PERCENT_SCALE),
            })}
            {box.withinCoverage ? null : (
              <>
                {' · '}
                <span className={styles.tail}>{t('packageBoxes.tail')}</span>
              </>
            )}
          </>
        )}
      </p>

      {box.measuredAt === null || isEditing ? null : (
        <p className={styles.hint}>
          {t('packageBoxes.measured', {
            height: toCentimetres(box.heightMm),
            length: toCentimetres(box.lengthMm),
            units: box.unitsPerBox,
            width: toCentimetres(box.widthMm),
          })}
          {' · '}
          {measurementSourceLabel(t, box)}
        </p>
      )}

      {isEditing ? (
        <PackageBoxMeasurementForm
          boxId={box.id}
          grossWeightGrams={box.grossWeightGrams}
          heightMm={box.heightMm}
          lengthMm={box.lengthMm}
          onCancel={onCancel}
          onSubmit={(submission) => onMeasure({ ...submission, id: box.id })}
          proposal={undefined}
          saving={saving}
          unitsPerBox={box.unitsPerBox}
          widthMm={box.widthMm}
        />
      ) : (
        <div className={styles.actions}>
          <Button onClick={onOpen} size="sm" type="button" variant="secondary">
            <Icon name="edit" />
            {box.measuredAt === null ? t('packageBoxes.measure') : t('packageBoxes.remeasure')}
          </Button>
        </div>
      )}
    </li>
  )
}
