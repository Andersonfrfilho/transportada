/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import type { MeasurementReliability } from '@/components/ui/boxDimension.service'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { BoxDimensionMeasuredResult } from '@/components/ui/boxDimensionProposal.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { usePackageBoxSiblings } from '../hooks/usePackageBoxQueue.hook'
import { CAMERA_MEASUREMENT_IS_EXPERIMENTAL } from '../shared/packageBoxMeasurement.constant'
import {
  dimensionReliability,
  firstUnreliableDimension,
  initialDimensionCentimetres,
  PACKAGE_BOX_DIMENSION_KEYS,
  proposedMarginMillimetres,
  type PackageBoxDimensionKey,
} from '../shared/packageBoxMeasurementProposal.service'
import {
  buildPackageBoxMeasurementSubmission,
  type PackageBoxMeasurementFormSubmission,
} from '../shared/packageBoxMeasurementSubmission.service'
import {
  MAX_CENTIMETRES,
  toCentimetres,
  toMillimetres,
} from '../shared/packageBoxMeasurementUnits.service'
import styles from '../styles/packageBoxes.module.css'

export type { PackageBoxMeasurementFormSubmission }

type DimensionKey = PackageBoxDimensionKey

const DIMENSION_KEYS = PACKAGE_BOX_DIMENSION_KEYS

const DIMENSION_FIELD: Readonly<Record<DimensionKey, keyof typeof MAX_CENTIMETRES>> = {
  height: 'heightMm',
  length: 'lengthMm',
  width: 'widthMm',
}

type PackageBoxMeasurementFormProps = Readonly<{
  boxId: string
  /** Spec 155 (D7, G009): a família tem irmã medida — vale buscar as irmãs para o botão rápido. */
  canQuickFillFromFamily: boolean
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

/**
 * Extraído de `PackageBoxMeasurementPanel` (spec 152 T10): o formulário de três campos que grava
 * uma caixa, agora capaz de abrir com a proposta da câmera (D6/D13/D17) além do digitado comum.
 *
 * ⚠️ **Encostar no campo muda a origem; trocar o número é que isenta a dimensão.** `edited` decide
 * `source` (`camera_adjusted`), mas o selo de margem e a confirmação de imprecisão só somem quando o
 * valor digitado **difere** da proposta — a mesma pergunta que o schema da API faz, e por isso
 * redigitar 59,9 sobre 599 mm continua pedindo confirmação em vez de virar `400` (3ª revisão).
 * A margem da proposta continua indo para a API junto de `proposed*Mm` (D17), porque ela pertence à
 * proposta da câmera, não ao valor final: sem isso o protocolo de validação (D16, "digite a fita em
 * todos os campos") apagaria a margem de quase toda leitura da sessão real.
 */
export function PackageBoxMeasurementForm({
  boxId,
  canQuickFillFromFamily,
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
  /** D9: sob demanda — só busca quando a família tem irmã medida, nunca junto da fila. */
  const { siblings } = usePackageBoxSiblings({
    boxId: canQuickFillFromFamily ? boxId : null,
  })
  const measuredSibling = siblings?.family.find((sibling) => sibling.measuredAt !== null)
  const [length, setLength] = useState(() =>
    initialDimensionCentimetres({ dimension: 'length', proposal, storedMm: lengthMm }),
  )
  const [width, setWidth] = useState(() =>
    initialDimensionCentimetres({ dimension: 'width', proposal, storedMm: widthMm }),
  )
  const [height, setHeight] = useState(() =>
    initialDimensionCentimetres({ dimension: 'height', proposal, storedMm: heightMm }),
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
    return dimensionReliability({ dimension, edited, proposal, recorded: parsed })
  }

  /** M9: o foco vai para a PRIMEIRA dimensão em branco, não para a última da lista. */
  const focusedDimension = firstUnreliableDimension({ edited, proposal, recorded: parsed })

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
    return buildPackageBoxMeasurementSubmission({
      edited,
      grossWeightGrams,
      heightMm: parsed.height,
      impreciseConfirmed,
      lengthMm: parsed.length,
      proposal,
      unitsPerBox: Math.max(1, Math.round(Number(units.trim()) || 1)),
      widthMm: parsed.width,
    })
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

      {/*
        ⚠️ D7/G009: só PREENCHE os campos — nunca grava sozinho. O conferente confere contra a caixa
        na mão e salva pelo botão de sempre; por isso fica fora do fluxo de submit (`type="button"`).
      */}
      {measuredSibling === undefined ? null : (
        <Button
          onClick={() => {
            setLength(toCentimetres(measuredSibling.lengthMm))
            setWidth(toCentimetres(measuredSibling.widthMm))
            setHeight(toCentimetres(measuredSibling.heightMm))
            setUnits(String(measuredSibling.unitsPerBox))
            setEdited({ height: true, length: true, width: true })
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="copy" size="sm" />
          {t('packageBoxes.quickFill.useMeasurementOf', { label: measuredSibling.variantLabel })}
        </Button>
      )}

      <div className={styles.dimensions}>
        {DIMENSION_KEYS.map((dimension) => (
          <DimensionField
            {...(dimension === focusedDimension ? { inputRef: firstUnreliableRef } : {})}
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
