/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { classifyMargin, type MeasurementReliability } from '@/components/ui/boxDimension.service'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { BoxDimensionMeasuredResult } from '@/components/ui/useBoxDimensionScanner.hook'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { PackageBoxMeasurementInput } from '../shared/packageBoxClient.service'
import { CAMERA_MEASUREMENT_IS_EXPERIMENTAL } from '../shared/packageBoxMeasurement.constant'
import {
  MAX_CENTIMETRES,
  toCentimetres,
  toMillimetres,
} from '../shared/packageBoxMeasurementUnits.service'
import styles from '../styles/packageBoxes.module.css'

export type PackageBoxMeasurementFormSubmission = Omit<PackageBoxMeasurementInput, 'id'>

type DimensionKey = 'height' | 'length' | 'width'

const DIMENSION_KEYS: readonly DimensionKey[] = ['length', 'width', 'height']

const DIMENSION_FIELD: Readonly<Record<DimensionKey, keyof typeof MAX_CENTIMETRES>> = {
  height: 'heightMm',
  length: 'lengthMm',
  width: 'widthMm',
}

type PackageBoxMeasurementFormProps = Readonly<{
  boxId: string
  grossWeightGrams: null | number
  /** Ausente: formulário digitado comum (D11). Presente: proposta da câmera (D6, D13, D17). */
  proposal: BoxDimensionMeasuredResult | undefined
  heightMm: null | number
  lengthMm: null | number
  onCancel: () => void
  onSubmit: (submission: PackageBoxMeasurementFormSubmission) => void
  saving: boolean
  unitsPerBox: number
  widthMm: null | number
}>

function proposedMillimetres(
  proposal: BoxDimensionMeasuredResult | undefined,
  dimension: DimensionKey,
): number | undefined {
  if (proposal === undefined) return undefined
  const value = proposal[`${dimension}Mm`]
  return value > 0 ? value : undefined
}

function proposedMarginMillimetres(
  proposal: BoxDimensionMeasuredResult | undefined,
  dimension: DimensionKey,
): number | undefined {
  return proposal?.[`${dimension}MarginMm`]
}

/**
 * Extraído de `PackageBoxMeasurementPanel` (spec 152 T10): o formulário de três campos que grava
 * uma caixa, agora capaz de abrir com a proposta da câmera (D6/D13/D17) além do digitado comum.
 *
 * ⚠️ **Margem e selo só existem enquanto o campo continua com o valor da câmera.** Editar um campo
 * (`edited[dimension] = true`) some com a margem/aviso dele — a partir daí é medida digitada por
 * cima, e a regra de imprecisão (D6) não se aplica mais àquela dimensão. `impreciseConfirmed`
 * cobre só as dimensões que continuam sem edição (a API confere o mesmo bloco `camera`).
 */
export function PackageBoxMeasurementForm({
  boxId,
  grossWeightGrams,
  heightMm,
  lengthMm,
  onCancel,
  onSubmit,
  proposal,
  saving,
  unitsPerBox,
  widthMm,
}: PackageBoxMeasurementFormProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [length, setLength] = useState(() =>
    toCentimetres(proposedMillimetres(proposal, 'length') ?? lengthMm),
  )
  const [width, setWidth] = useState(() =>
    toCentimetres(proposedMillimetres(proposal, 'width') ?? widthMm),
  )
  const [height, setHeight] = useState(() =>
    toCentimetres(proposedMillimetres(proposal, 'height') ?? heightMm),
  )
  const [units, setUnits] = useState(() => String(unitsPerBox))
  const [edited, setEdited] = useState<Readonly<Record<DimensionKey, boolean>>>({
    height: false,
    length: false,
    width: false,
  })
  const [impreciseChoice, setImpreciseChoice] = useState<'confirming' | 'idle'>('idle')
  const firstUnreliableRef = useRef<HTMLInputElement>(null)

  const values = { height, length, width }
  const setters: Readonly<Record<DimensionKey, (value: string) => void>> = {
    height: setHeight,
    length: setLength,
    width: setWidth,
  }
  const parsed = {
    height: toMillimetres(height, 'heightMm'),
    length: toMillimetres(length, 'lengthMm'),
    width: toMillimetres(width, 'widthMm'),
  }

  /**
   * D6: o campo acima de 30 mm nasce vazio, e o foco vai direto para ele. Roda uma vez por proposta
   * (a identidade de `proposal` muda a cada captura — nunca em cada tecla digitada).
   */
  useEffect(() => {
    if (proposal === undefined) return
    firstUnreliableRef.current?.focus()
  }, [proposal])

  function reliabilityOf(dimension: DimensionKey): MeasurementReliability | undefined {
    if (edited[dimension]) return undefined
    const marginMm = proposedMarginMillimetres(proposal, dimension)
    return marginMm === undefined ? undefined : classifyMargin(marginMm)
  }

  /** D6/R2: só dimensões ainda não editadas carregam a imprecisão da câmera adiante. */
  const unconfirmedImpreciseDimensions = DIMENSION_KEYS.filter(
    (dimension) => reliabilityOf(dimension) === 'imprecise',
  )
  const requiresConfirmation = unconfirmedImpreciseDimensions.length > 0
  const canSave =
    parsed.length !== null && parsed.width !== null && parsed.height !== null && !saving

  function buildSubmission(
    impreciseConfirmed: boolean,
  ): PackageBoxMeasurementFormSubmission | undefined {
    if (parsed.length === null || parsed.width === null || parsed.height === null) return undefined
    const unitsValue = Math.max(1, Math.round(Number(units.trim()) || 1))
    const measurement = {
      grossWeightGrams,
      heightMm: parsed.height,
      lengthMm: parsed.length,
      unitsPerBox: unitsValue,
      widthMm: parsed.width,
    }
    if (proposal === undefined) return { ...measurement, source: 'typed' }

    const hasEditedAnyField = edited.length || edited.width || edited.height
    const proposedLength = proposedMillimetres(proposal, 'length')
    const proposedWidth = proposedMillimetres(proposal, 'width')
    const proposedHeight = proposedMillimetres(proposal, 'height')
    const camera = {
      engine: proposal.engine,
      impreciseConfirmed,
      warnings: proposal.warnings,
      ...(edited.length ? {} : { lengthMarginMm: proposal.lengthMarginMm }),
      ...(edited.width ? {} : { widthMarginMm: proposal.widthMarginMm }),
      ...(edited.height ? {} : { heightMarginMm: proposal.heightMarginMm }),
      ...(proposedLength === undefined ? {} : { proposedLengthMm: proposedLength }),
      ...(proposedWidth === undefined ? {} : { proposedWidthMm: proposedWidth }),
      ...(proposedHeight === undefined ? {} : { proposedHeightMm: proposedHeight }),
    }
    return {
      ...measurement,
      camera,
      source: hasEditedAnyField ? 'camera_adjusted' : 'camera',
    }
  }

  function handleSubmit(): void {
    if (!canSave) return
    if (requiresConfirmation) {
      setImpreciseChoice('confirming')
      return
    }
    const submission = buildSubmission(false)
    if (submission !== undefined) onSubmit(submission)
  }

  function handleConfirmedSave(): void {
    const submission = buildSubmission(true)
    setImpreciseChoice('idle')
    if (submission !== undefined) onSubmit(submission)
  }

  const worstMargin = Math.max(
    ...unconfirmedImpreciseDimensions.map(
      (dimension) => proposedMarginMillimetres(proposal, dimension) ?? 0,
    ),
    0,
  )

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}
    >
      {proposal === undefined || !CAMERA_MEASUREMENT_IS_EXPERIMENTAL ? null : (
        <div className={styles.experimentalBadge}>
          <Badge variant="secondary">
            <Icon name="alert" size="sm" />
            {t('packageBoxes.experimentalBadge')}
          </Badge>
          <p className={styles.hint}>{t('packageBoxes.experimentalHint')}</p>
          {proposal.warnings.length === 0 ? null : (
            <ul className={styles.warningsList}>
              {proposal.warnings.map((warning) => (
                <li key={warning}>{t(`packageBoxes.warnings.${warning}`)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.dimensions}>
        {DIMENSION_KEYS.map((dimension) => (
          <DimensionField
            {...(reliabilityOf(dimension) === 'unreliable' ? { inputRef: firstUnreliableRef } : {})}
            field={DIMENSION_FIELD[dimension]}
            id={`${boxId}-${dimension}`}
            key={dimension}
            label={t(`packageBoxes.${dimension}`)}
            marginMm={
              reliabilityOf(dimension) === undefined
                ? undefined
                : proposedMarginMillimetres(proposal, dimension)
            }
            onChange={(value) => {
              setEdited((current) => ({ ...current, [dimension]: true }))
              setters[dimension](value)
            }}
            parsed={parsed[dimension]}
            reliability={reliabilityOf(dimension)}
            value={values[dimension]}
          />
        ))}
        <label className={styles.field} htmlFor={`${boxId}-units`}>
          {t('packageBoxes.unitsPerBox')}
          <input
            id={`${boxId}-units`}
            inputMode="numeric"
            onChange={(event) => setUnits(event.target.value)}
            value={units}
          />
        </label>
      </div>

      <div className={styles.actions}>
        <Button disabled={!canSave} size="sm" type="submit">
          <Icon name="check" />
          {t('packageBoxes.save')}
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          {t('packageBoxes.cancel')}
        </Button>
      </div>

      {impreciseChoice !== 'confirming' ? null : (
        <ImpreciseConfirmDialog
          marginCm={worstMargin / 10}
          onConfirm={handleConfirmedSave}
          onTypeInstead={() => setImpreciseChoice('idle')}
        />
      )}
    </form>
  )
}

type DimensionFieldProps = Readonly<{
  field: keyof typeof MAX_CENTIMETRES
  id: string
  inputRef?: RefObject<HTMLInputElement | null>
  label: string
  marginMm: number | undefined
  onChange: (value: string) => void
  parsed: number | null
  reliability: MeasurementReliability | undefined
  value: string
}>

function DimensionField({
  field,
  id,
  inputRef,
  label,
  marginMm,
  onChange,
  parsed,
  reliability,
  value,
}: DimensionFieldProps) {
  const { t } = useTranslation('nfeWorkspace')
  const invalid = value.trim() !== '' && parsed === null
  const marginCm = marginMm === undefined ? undefined : marginMm / 10
  const describedBy = [
    invalid ? `${id}-error` : undefined,
    reliability === 'reliable' || reliability === 'imprecise' ? `${id}-margin` : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(' ')

  return (
    <label className={styles.field} htmlFor={id}>
      {label}
      <input
        aria-describedby={describedBy === '' ? undefined : describedBy}
        aria-invalid={invalid}
        id={id}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        ref={inputRef}
        value={value}
      />
      {reliability === 'reliable' || reliability === 'imprecise' ? (
        <span className={styles.marginText} id={`${id}-margin`}>
          {t('packageBoxes.margin', { margin: formatMargin(marginCm ?? 0) })}
        </span>
      ) : null}
      {reliability === 'imprecise' ? (
        <span className={styles.marginWarning} role="alert">
          <Icon name="alert" size="sm" />
          {t('packageBoxes.imprecise', { margin: formatMargin(marginCm ?? 0) })}
        </span>
      ) : null}
      {reliability === 'unreliable' ? (
        <span className={styles.fieldError} role="alert">
          <Icon name="alert" size="sm" />
          {t('packageBoxes.unreliable')}
        </span>
      ) : null}
      {invalid ? (
        <span className={styles.fieldError} id={`${id}-error`} role="alert">
          {t('packageBoxes.outOfRange', { max: MAX_CENTIMETRES[field] })}
        </span>
      ) : null}
    </label>
  )
}

function formatMargin(marginCm: number): string {
  return String(Number.isInteger(marginCm) ? marginCm : marginCm.toFixed(1)).replace('.', ',')
}

type ImpreciseConfirmDialogProps = Readonly<{
  marginCm: number
  onConfirm: () => void
  onTypeInstead: () => void
}>

/** R2: nada grava sem esta escolha explícita — "Gravar assim" ou "Digitar a medida". */
function ImpreciseConfirmDialog({
  marginCm,
  onConfirm,
  onTypeInstead,
}: ImpreciseConfirmDialogProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: onTypeInstead })

  return createPortal(
    <div className={styles.candidatesOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="package-box-imprecise-title"
        aria-modal="true"
        className={styles.candidatesDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h3 id="package-box-imprecise-title">
          {t('packageBoxes.impreciseConfirmTitle', { margin: formatMargin(marginCm) })}
        </h3>
        <div className={styles.actions}>
          <Button onClick={onConfirm} size="sm" type="button">
            <Icon name="check" />
            {t('packageBoxes.impreciseConfirmSave')}
          </Button>
          <Button onClick={onTypeInstead} size="sm" type="button" variant="secondary">
            <Icon name="edit" />
            {t('packageBoxes.impreciseConfirmType')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
