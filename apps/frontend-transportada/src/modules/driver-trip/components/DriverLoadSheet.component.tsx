/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Barcode } from '@/components/ui/barcode'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

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
 */
export function DriverLoadSheet({ trip }: DriverLoadSheetProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <section className={styles.loadSheet}>
      <header className={styles.loadSheetHeader}>
        <h2>{t('loadSheet.title')}</h2>
        {/* O aviso é irmão do título de propósito: quem lê um, lê o outro */}
        <p className={styles.loadSheetDisclaimer}>{t('loadSheet.notFiscal')}</p>
        <p className={styles.loadSheetMeta}>{t('vehicle', { plate: trip.vehiclePlate })}</p>
        <Button
          className={styles.printAction}
          onClick={() => window.print()}
          type="button"
          variant="ghost"
        >
          <Icon name="document" />
          {t('loadSheet.print')}
        </Button>
      </header>

      <ol className={styles.loadSheetStops}>
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
