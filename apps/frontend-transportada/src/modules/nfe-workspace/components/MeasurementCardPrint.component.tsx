/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { MARKER_SIDE_MM } from '@/components/ui/boxDimension.constant'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { MEASUREMENT_CARD_MARKER_GRID } from '../shared/measurementCardMarker.constant'
import styles from '../styles/measurementCardPrint.module.css'

export type MeasurementCardPrintProps = Readonly<{
  isOpen: boolean
  onClose: () => void
}>

/** D3: régua de controle de 100 mm — o conferente confere com a fita antes do primeiro uso. */
const RULER_LENGTH_MM = 100
const RULER_TICKS = Array.from({ length: RULER_LENGTH_MM / 10 + 1 }, (_, index) => index * 10)

const TITLE_ID = 'measurement-card-print-title'

/**
 * D3: a página "Cartão de medição" que o conferente imprime pelo próprio app — nunca SVG cru
 * (regra do design system): o ArUco é uma grade de células (`div`) preenchidas por
 * `MEASUREMENT_CARD_MARKER_GRID`, a mesma matriz que o worker de medida detecta (ADR-0065). O
 * cartão só funciona impresso em escala real: a régua de 100 mm é a defesa contra "ajustar à
 * página", que erraria todas as três dimensões na mesma proporção, e caladamente (spec 152 D3).
 */
export function MeasurementCardPrint({ isOpen, onClose }: MeasurementCardPrintProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })

  if (!isOpen) return null

  const cellSizeMm = MARKER_SIDE_MM / MEASUREMENT_CARD_MARKER_GRID.length

  return createPortal(
    /* Sem a marca, a regra global de impressão escondia o cartão e só saía papel em branco. */
    <div className={styles.overlay} data-print-region onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={TITLE_ID}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.head}>
          <h3 className={styles.title} id={TITLE_ID}>
            {t('packageBoxes.printCard.title')}
          </h3>
          <div className={styles.headActions}>
            <Button onClick={() => window.print()} type="button">
              <Icon name="download" />
              {t('packageBoxes.printCard.print')}
            </Button>
            <Button
              aria-label={t('packageBoxes.printCard.close')}
              onClick={onClose}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
            </Button>
          </div>
        </div>

        <p className={styles.instruction}>{t('packageBoxes.printCard.instruction')}</p>
        <p className={styles.hint}>{t('packageBoxes.printCard.confirmRuler')}</p>

        <div className={styles.sheet}>
          <div
            className={styles.marker}
            style={{
              gridTemplateColumns: `repeat(${MEASUREMENT_CARD_MARKER_GRID.length}, ${cellSizeMm}mm)`,
              gridTemplateRows: `repeat(${MEASUREMENT_CARD_MARKER_GRID.length}, ${cellSizeMm}mm)`,
            }}
          >
            {MEASUREMENT_CARD_MARKER_GRID.flatMap((row, rowIndex) =>
              row
                .split('')
                .map((cell, columnIndex) => (
                  <span
                    className={cell === '1' ? styles.cellBlack : styles.cellWhite}
                    key={`${rowIndex}-${columnIndex}`}
                  />
                )),
            )}
          </div>

          <div
            aria-label={t('packageBoxes.printCard.rulerLabel')}
            className={styles.ruler}
            role="img"
          >
            <div className={styles.rulerBar} style={{ width: `${RULER_LENGTH_MM}mm` }}>
              {RULER_TICKS.map((tick) => (
                <span className={styles.rulerTick} key={tick} style={{ left: `${tick}mm` }}>
                  <span className={styles.rulerTickMark} />
                  <span className={styles.rulerTickLabel}>{tick}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
