/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/components/DriverLoadSheet.component.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Barcode } from '@/components/ui/barcode'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'

import type { DriverTrip } from '../shared/driverTrip.types'
import styles from '../styles/driverTrip.module.css'

type DriverLoadSheetProps = Readonly<{
  trip: DriverTrip
}>

/**
 * Spec 065 D1: o **romaneio de carga**. Entre a saída do caminhão e o MDF-e, é o que o motorista tem
 * na mão — e a carga urbana não terá manifesto nenhum, então para ela isto é o que existe.
 *
 * **Ele não se chama "pré-MDF-e", e essa é a decisão.** Um papel com esse título, veículo, condutor e
 * lista de notas *parece* um DAMDFE; numa barreira, parecer é o bastante para alguém apresentá-lo, e
 * apresentar documento que imita fiscal e não é vale mais caro do que não apresentar nada. O aviso
 * vem junto do título, na tela e no papel.
 *
 * ⚠️ Na tela o cabeçalho é **só ícones** (decisão do usuário, 2026-09-25): o título por extenso mora
 * no `h2` visualmente oculto — para leitor de tela — e reaparece no papel impresso (`@media print`),
 * nunca como texto visível na tela.
 */
export function DriverLoadSheet({ trip }: DriverLoadSheetProps) {
  const { t } = useTranslation('driverTrip')
  /** Recolhido por padrão: a lista de notas não empurra a viagem para baixo até o motorista pedir. */
  const [isExpanded, setExpanded] = useState(false)
  const stopsListId = useId()
  const titleId = useId()
  const noteCount = trip.stops.reduce((total, stop) => total + stop.documents.length, 0)
  const toggleLabel = isExpanded ? t('loadSheet.hide') : t('loadSheet.show')

  return (
    <section aria-labelledby={titleId} className={styles.loadSheet}>
      <header className={styles.loadSheetHeader}>
        <h2 className={styles.loadSheetTitle} id={titleId}>
          {t('loadSheet.title')}
        </h2>
        <div className={styles.loadSheetIconRow}>
          {/* A contagem de notas: ícone + número, com a dica dizendo o nome por extenso. */}
          <Tooltip label={t('loadSheet.title')}>
            <span
              aria-label={t('loadSheet.noteCount', { count: noteCount })}
              className={styles.loadSheetCount}
            >
              <Icon name="clipboard-list" />
              {noteCount}
            </span>
          </Tooltip>
          {/* O aviso é irmão do título de propósito: quem lê um, lê o outro, pela dica no toque. */}
          <Tooltip label={t('loadSheet.notFiscal')}>
            <button
              aria-label={t('loadSheet.notFiscal')}
              className={styles.loadSheetNotFiscalIcon}
              type="button"
            >
              <Icon name="alert" />
            </button>
          </Tooltip>
          <Tooltip label={t('loadSheet.print')}>
            <button
              aria-label={t('loadSheet.print')}
              className={styles.loadSheetIconButton}
              onClick={() => window.print()}
              type="button"
            >
              <Icon name="printer" />
            </button>
          </Tooltip>
          <Tooltip label={toggleLabel}>
            <button
              aria-controls={stopsListId}
              aria-expanded={isExpanded}
              aria-label={toggleLabel}
              className={`${styles.loadSheetIconButton} ${styles.loadSheetToggleButton} ${isExpanded ? styles.loadSheetToggleOpen : ''}`}
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              <Icon name="chevron-down" />
            </button>
          </Tooltip>
        </div>
        <p className={styles.loadSheetDisclaimer}>{t('loadSheet.notFiscal')}</p>
        <p className={styles.loadSheetMeta}>{t('vehicle', { plate: trip.vehiclePlate })}</p>
      </header>

      {/* Recolhida, a lista continua no DOM: o papel impresso leva o romaneio inteiro (CSS de impressão) */}
      <ol className={styles.loadSheetStops} hidden={!isExpanded} id={stopsListId}>
        {trip.stops.map((stop) => (
          <li className={styles.loadSheetStop} key={stop.id}>
            <h3>
              {t('stopTitle', { sequence: stop.sequence })} — {stop.label}
            </h3>
            <ul className={styles.loadSheetNotes}>
              {stop.documents.map((document) => (
                <li className={styles.loadSheetNote} key={document.id}>
                  <p className={styles.loadSheetNoteHead}>
                    {t('loadSheet.note', { number: document.number, series: document.series })} —{' '}
                    {document.recipientName}
                  </p>
                  <p className={styles.loadSheetTotals}>
                    {t('loadSheet.volumes', { count: Number(document.volumeCount) })} ·{' '}
                    {t('loadSheet.weight', { weight: document.grossWeight })}
                  </p>
                  {/* A chave por extenso é o que se consulta no portal; o código é o que se bipa */}
                  <p className={styles.loadSheetKey}>{document.accessKey}</p>
                  <Barcode
                    label={t('loadSheet.barcodeLabel', { number: document.number })}
                    value={document.accessKey}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
