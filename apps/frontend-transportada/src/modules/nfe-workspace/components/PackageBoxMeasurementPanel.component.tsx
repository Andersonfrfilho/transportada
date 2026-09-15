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

import {
  PACKAGE_BOX_STATUS_FILTERS,
  type PackageBox,
  type PackageBoxQueue,
  type PackageBoxStatusFilter,
} from '../shared/packageBoxClient.service'
import styles from '../styles/packageBoxes.module.css'

type PackageBoxMeasurement = Readonly<{
  grossWeightGrams: null | number
  heightMm: number
  lengthMm: number
  unitsPerBox: number
  widthMm: number
}>

type PackageBoxMeasurementPanelProps = Readonly<{
  denied: boolean
  failed: boolean
  loading: boolean
  /** `true` enquanto a fila reconsulta a API por causa de um bipe — não o carregamento inicial. */
  matching: boolean
  onMeasure: (input: PackageBoxMeasurement & { id: string }) => void
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

/**
 * ⚠️ **A tela fala centímetro, o banco guarda milímetro.** A fita métrica do galpão é marcada em
 * cm, e obrigar o conferente a multiplicar por dez de cabeça, de pé, a cada caixa, é onde nasce o
 * erro de uma ordem de grandeza — 38 virando 38 mm. A coluna continua `length_mm` porque milímetro
 * é inteiro e não perde meia unidade; a conversão mora **aqui**, num lugar só, na borda.
 *
 * ⚠️ Os tetos são **cópia por valor** dos CHECKs da coluna (6000/3000/3000 mm), guardados por
 * contrato. Sem eles, digitar 900 de comprimento devolvia um `400` genérico que virava "não foi
 * possível gravar" sem dizer qual campo — e `web.md` §11 exige o erro ancorado no campo.
 */
const MAX_CENTIMETRES = { heightMm: 300, lengthMm: 600, widthMm: 300 } as const

const MILLIMETRES_PER_CENTIMETRE = 10
const PERCENT_SCALE = 100

/**
 * O caminho de volta: milímetro guardado vira centímetro digitável. Sem ele o formulário abria em
 * branco sobre uma medida que existe — a mesma falha que `CargoVolumeFactorPanel` já evita —, e
 * gravar por cima devolvia `unidades por caixa` a 1 **em silêncio**.
 */
function toCentimetres(millimetres: null | number): string {
  if (millimetres === null) return ''
  const centimetres = millimetres / MILLIMETRES_PER_CENTIMETRE
  return String(Number.isInteger(centimetres) ? centimetres : centimetres.toFixed(1)).replace(
    '.',
    ',',
  )
}

/** Aceita vírgula: o teclado do celular manda `38,5`, e meio centímetro é medida legítima. */
function toMillimetres(value: string, field: keyof typeof MAX_CENTIMETRES): number | null {
  const centimetres = Number(value.trim().replace(',', '.'))
  if (!Number.isFinite(centimetres) || centimetres <= 0) return null
  if (centimetres > MAX_CENTIMETRES[field]) return null
  const millimetres = Math.round(centimetres * MILLIMETRES_PER_CENTIMETRE)
  return millimetres > 0 ? millimetres : null
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
  const [scanFeedback, setScanFeedback] = useState<BarcodeScannerFeedback | undefined>(undefined)
  /** `true` do bipe até a fila responder — é o sinal que diz quando avaliar achou/não achou. */
  const [awaitingScan, setAwaitingScan] = useState(false)
  /**
   * ⚠️ Mais de uma caixa achada nunca escolhe sozinha (o GTIN ainda não é gravado nas caixas — só
   * chave de acesso e código de produto casam hoje, e o segundo é ambíguo entre emitentes). A lista
   * mora aqui, não no `queue`: ela é o resultado de **um** bipe, e a fila recarrega por outros
   * motivos (troca de situação, busca) que não devem reabrir a escolha.
   */
  const [candidates, setCandidates] = useState<readonly PackageBox[] | null>(null)
  const closeScanTimer = useRef<number | undefined>(undefined)

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
    setCameFromScan(true)
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
  }, [awaitingScan, matching, queue, t, openMeasurementForScannedBox])

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
      </header>

      <div className={styles.search}>
        <label className={styles.field} htmlFor="package-box-search">
          {t('packageBoxes.searchLabel')}
          <input
            id="package-box-search"
            inputMode="search"
            onChange={(event) => {
              setCameFromScan(false)
              onSearchChange(event.target.value)
            }}
            type="search"
            value={search}
          />
        </label>
        <Button onClick={() => setIsScannerOpen(true)} type="button" variant="secondary">
          <Icon name="camera" />
          {t('packageBoxes.scan')}
        </Button>
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
  onMeasure: (input: PackageBoxMeasurement) => void
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
  const [lengthMm, setLengthMm] = useState(() => toCentimetres(box.lengthMm))
  const [widthMm, setWidthMm] = useState(() => toCentimetres(box.widthMm))
  const [heightMm, setHeightMm] = useState(() => toCentimetres(box.heightMm))
  /**
   * ⚠️ Quantas unidades vão dentro. Só importa quando `uCom` **não** é a embalagem: em `CX24` a nota
   * já conta caixas e o valor é 1, em `UN` ela conta unidades e sem isto a ocupação sairia
   * multiplicada por quantas couberem.
   */
  const [unitsPerBox, setUnitsPerBox] = useState(() => String(box.unitsPerBox))

  const length = toMillimetres(lengthMm, 'lengthMm')
  const width = toMillimetres(widthMm, 'widthMm')
  const height = toMillimetres(heightMm, 'heightMm')
  const units = Math.max(1, Math.round(Number(unitsPerBox.trim()) || 1))
  const canSave = length !== null && width !== null && height !== null

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
        </p>
      )}

      {isEditing ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            if (length === null || width === null || height === null) return
            onMeasure({
              grossWeightGrams: box.grossWeightGrams,
              heightMm: height,
              lengthMm: length,
              unitsPerBox: units,
              widthMm: width,
            })
          }}
        >
          <div className={styles.dimensions}>
            <DimensionField
              field="lengthMm"
              id={`${box.id}-length`}
              label={t('packageBoxes.length')}
              onChange={setLengthMm}
              parsed={length}
              value={lengthMm}
            />
            <DimensionField
              field="widthMm"
              id={`${box.id}-width`}
              label={t('packageBoxes.width')}
              onChange={setWidthMm}
              parsed={width}
              value={widthMm}
            />
            <DimensionField
              field="heightMm"
              id={`${box.id}-height`}
              label={t('packageBoxes.height')}
              onChange={setHeightMm}
              parsed={height}
              value={heightMm}
            />
            <label className={styles.field} htmlFor={`${box.id}-units`}>
              {t('packageBoxes.unitsPerBox')}
              <input
                id={`${box.id}-units`}
                inputMode="numeric"
                onChange={(event) => setUnitsPerBox(event.target.value)}
                value={unitsPerBox}
              />
            </label>
          </div>
          <div className={styles.actions}>
            <Button disabled={!canSave || saving} size="sm" type="submit">
              <Icon name="check" />
              {t('packageBoxes.save')}
            </Button>
            <Button onClick={onCancel} size="sm" type="button" variant="ghost">
              {t('packageBoxes.cancel')}
            </Button>
          </div>
        </form>
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

type DimensionFieldProps = Readonly<{
  field: keyof typeof MAX_CENTIMETRES
  id: string
  label: string
  onChange: (value: string) => void
  parsed: number | null
  value: string
}>

function DimensionField({ field, id, label, onChange, parsed, value }: DimensionFieldProps) {
  const { t } = useTranslation('nfeWorkspace')
  const invalid = value.trim() !== '' && parsed === null

  return (
    <label className={styles.field} htmlFor={id}>
      {label}
      <input
        aria-describedby={invalid ? `${id}-error` : undefined}
        aria-invalid={invalid}
        id={id}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {invalid ? (
        <span className={styles.fieldError} id={`${id}-error`} role="alert">
          {t('packageBoxes.outOfRange', { max: MAX_CENTIMETRES[field] })}
        </span>
      ) : null}
    </label>
  )
}
