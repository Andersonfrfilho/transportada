/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { PackageBox, PackageBoxQueue } from '../shared/packageBoxClient.service'
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
  onMeasure: (input: PackageBoxMeasurement & { id: string }) => void
  onPendingOnlyChange: (pendingOnly: boolean) => void
  onScan: (text: string) => void
  onSearchChange: (search: string) => void
  pendingOnly: boolean
  queue: PackageBoxQueue | null
  saving: boolean
  search: string
}>

/**
 * ⚠️ Os tetos são **cópia por valor** dos CHECKs da coluna, guardados por contrato. Sem eles, digitar
 * 9000 de comprimento devolvia um `400` genérico que virava "não foi possível gravar" sem dizer qual
 * campo — e `web.md` §11 exige o erro ancorado no campo.
 */
const MAX_MILLIMETRES = { heightMm: 3000, lengthMm: 6000, widthMm: 3000 } as const

const PERCENT_SCALE = 100

function toMillimetres(value: string, field: keyof typeof MAX_MILLIMETRES): number | null {
  const parsed = Number(value.trim().replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  const rounded = Math.round(parsed)
  return rounded > MAX_MILLIMETRES[field] ? null : rounded
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
  onMeasure,
  onPendingOnlyChange,
  onScan,
  onSearchChange,
  pendingOnly,
  queue,
  saving,
  search,
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

  if (denied) return <p className={styles.notice}>{t('packageBoxes.denied')}</p>
  if (loading) return <QueueSkeleton />
  if (failed) return <p className={styles.notice}>{t('packageBoxes.failed')}</p>

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
        <Button onClick={() => setIsScannerOpen(true)} size="sm" type="button" variant="secondary">
          <Icon name="camera" />
          {t('packageBoxes.scan')}
        </Button>
      </div>

      <Checkbox
        checked={pendingOnly}
        label={t('packageBoxes.pendingOnly')}
        onChange={onPendingOnlyChange}
      />

      {items.length === 0 ? (
        <p className={styles.notice}>{t('packageBoxes.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((box) => (
            <PackageBoxRow
              box={box}
              isEditing={editingId === box.id}
              key={box.id}
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

      <BarcodeScanner
        closeLabel={t('packageBoxes.scanner.close')}
        deniedMessage={t('packageBoxes.scanner.denied')}
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onRead={(text) => {
          onScan(text)
          setCameFromScan(true)
          setIsScannerOpen(false)
        }}
        readingMessage={t('packageBoxes.scanner.reading')}
        startingMessage={t('packageBoxes.scanner.starting')}
        title={t('packageBoxes.scanner.title')}
        unavailableMessage={t('packageBoxes.scanner.unavailable')}
      />
    </section>
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
  const [lengthMm, setLengthMm] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [heightMm, setHeightMm] = useState('')
  /**
   * ⚠️ Quantas unidades vão dentro. Só importa quando `uCom` **não** é a embalagem: em `CX24` a nota
   * já conta caixas e o valor é 1, em `UN` ela conta unidades e sem isto a ocupação sairia
   * multiplicada por quantas couberem.
   */
  const [unitsPerBox, setUnitsPerBox] = useState('1')

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
      <p className={styles.hint}>
        {t('packageBoxes.transported', { count: box.transportedVolumes })} ·{' '}
        {t('packageBoxes.cumulative', { percent: Math.round(box.cumulativeShare * PERCENT_SCALE) })}
        {box.withinCoverage ? null : (
          <>
            {' · '}
            <span className={styles.tail}>{t('packageBoxes.tail')}</span>
          </>
        )}
      </p>

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
  field: keyof typeof MAX_MILLIMETRES
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
          {t('packageBoxes.outOfRange', { max: MAX_MILLIMETRES[field] })}
        </span>
      ) : null}
    </label>
  )
}
