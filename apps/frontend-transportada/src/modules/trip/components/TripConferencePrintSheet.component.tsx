/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatStoredPhone } from '@/modules/shared/phone.service'
import { formatTaxId } from '@/modules/shared/taxId.service'
import { InstallationBrandMark } from '@/modules/identity/components/InstallationBrandMark.component'
import { useInstallationBrandView } from '@/modules/identity/hooks/useInstallationBrandView.hook'

import type { TripConference } from '../shared/tripConference.service'
import type { TripDriverLine } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripConferencePrintSheetProps = Readonly<{
  conference: TripConference
  drivers: readonly TripDriverLine[]
  printedOn: Date
  tripCode: string
  vehiclePlate: null | string
}>

type SheetFieldProps = Readonly<{ label: string; value: string }>

const NON_BREAKING_SPACE = /\u00a0/gu
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: SAO_PAULO_TIME_ZONE,
})
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: SAO_PAULO_TIME_ZONE,
})

function formatMoney(value: string): string {
  return formatAmount(value).replace(NON_BREAKING_SPACE, ' ')
}

function SheetField({ label, value }: SheetFieldProps) {
  if (value === '') return null

  return (
    <div className={styles.printSheetField}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function describeDriver(driver: TripDriverLine): string {
  const taxId = driver.driverTaxId === null ? '' : ` · ${formatTaxId(driver.driverTaxId)}`
  const phone =
    driver.driverPhone === null || driver.driverPhone === undefined
      ? ''
      : ` · ${formatStoredPhone(driver.driverPhone)}`

  return `${driver.driverName}${taxId}${phone}`
}

/**
 * A folha que o motorista assina: fica fora da tela e só existe na impressão, pelo mesmo
 * `data-print-region` que o resto do painel usa para esconder tudo o mais. Leva só o que existe na
 * viagem — nenhuma linha em branco além das notas.
 */
export function TripConferencePrintSheet({
  conference,
  drivers,
  printedOn,
  tripCode,
  vehiclePlate,
}: TripConferencePrintSheetProps) {
  const { t } = useTranslation('trip')
  const brand = useInstallationBrandView()
  const { rows, summary } = conference
  const crew = drivers.filter((driver) => driver.role !== 'helper')

  return createPortal(
    <div className={styles.printSheet} data-print-region>
      <header className={styles.printSheetHeader}>
        <span className={styles.printSheetBrand}>
          <InstallationBrandMark
            brand={brand}
            logoClassName={styles.printSheetLogo}
            nameClassName={styles.printSheetBrandName}
          />
        </span>
        <div className={styles.printSheetHeading}>
          <h1>{t('conference.sheetTitle')}</h1>
          <p>
            {t('conference.sheetPrintedAt')} {dateTimeFormatter.format(printedOn)}
          </p>
        </div>
      </header>

      <dl className={styles.printSheetInfo}>
        {crew.map((driver) => (
          <SheetField
            key={driver.driverId}
            label={t('conference.sheetDriver')}
            value={describeDriver(driver)}
          />
        ))}
        <SheetField label={t('conference.sheetVehicle')} value={vehiclePlate ?? ''} />
        <SheetField label={t('conference.sheetTrip')} value={tripCode} />
        <SheetField
          label={t('conference.sheetNotes')}
          value={`${summary.noteCount} · ${summary.totalVolumes} ${t('conference.sheetVolumes').toLowerCase()}`}
        />
      </dl>

      <table className={styles.printSheetTable}>
        <thead>
          <tr>
            <th scope="col">{t('conference.sheetQuantity')}</th>
            <th scope="col">{t('conference.sheetInvoice')}</th>
            <th scope="col">{t('conference.sheetIssuedAt')}</th>
            <th scope="col">{t('conference.sheetClient')}</th>
            <th scope="col">{t('conference.sheetCity')}</th>
            <th scope="col">{t('conference.sheetDeliveredAt')}</th>
            <th scope="col">{t('conference.sheetDeliveryStatus')}</th>
            <th scope="col">{t('conference.sheetVolumes')}</th>
            <th scope="col">{t('conference.sheetValue')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.documentId}>
              <td>{index + 1}</td>
              <td>{row.noteNumber}</td>
              <td>{row.issuedAt === null ? '' : dayFormatter.format(new Date(row.issuedAt))}</td>
              <td className={styles.printSheetClient}>{row.clientName}</td>
              <td className={styles.printSheetClient}>
                {row.city === '' ? row.destinationLabel : row.city}
              </td>
              <td />
              <td />
              <td>{row.volumeCount ?? ''}</td>
              <td className={styles.printSheetMoney}>
                {row.totalValue === null ? '' : formatMoney(row.totalValue)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={7} scope="row">
              {t('conference.sheetTotal')} · {summary.noteCount}{' '}
              {t('conference.sheetNotes').toLowerCase()}
            </th>
            <td>{summary.totalVolumes}</td>
            <td className={styles.printSheetMoney}>{formatMoney(summary.totalValue)}</td>
          </tr>
        </tfoot>
      </table>

      <div className={styles.printSheetSignatures}>
        <span>{t('conference.sheetDriverSignature')}</span>
        <span>{t('conference.sheetCheckedBy')}</span>
        <span>{t('conference.sheetDate')}</span>
      </div>
    </div>,
    document.body,
  )
}
