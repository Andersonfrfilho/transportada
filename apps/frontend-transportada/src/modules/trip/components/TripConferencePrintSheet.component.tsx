/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'

import { InstallationBrandMark } from '@/modules/identity/components/InstallationBrandMark.component'
import type { InstallationBrandView } from '@/modules/identity/hooks/useInstallationBrandView.hook'

import type {
  TripConferenceSheetLabels,
  TripConferenceSheetModel,
} from '../shared/tripConferenceSheet.service'
import styles from '../styles/trip.module.css'

type TripConferencePrintSheetProps = Readonly<{
  brand: InstallationBrandView
  labels: TripConferenceSheetLabels
  sheet: TripConferenceSheetModel
}>

/**
 * A folha que o motorista assina: fica fora da tela e só existe na impressão, pelo mesmo
 * `data-print-region` que o resto do painel usa para esconder tudo o mais. Leva só o que existe na
 * viagem — nenhuma linha em branco além das notas.
 */
export function TripConferencePrintSheet({ brand, labels, sheet }: TripConferencePrintSheetProps) {
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
          <h1>{labels.title}</h1>
          <p>{sheet.printedAtText}</p>
        </div>
      </header>

      <dl className={styles.printSheetInfo}>
        {sheet.fields.map((field, index) => (
          <div className={styles.printSheetField} key={`${field.label}-${index}`}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>

      {sheet.routeCities === '' ? null : (
        <p className={styles.printSheetRoute}>
          <strong>{labels.routeCities}</strong> {sheet.routeCities}
        </p>
      )}

      <table className={styles.printSheetTable}>
        <thead>
          <tr>
            {sheet.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row) => (
            <tr key={`${row[0]}-${row[1]}`}>
              {row.map((cell, index) => (
                <td
                  className={
                    index === 3 || index === 4
                      ? styles.printSheetClient
                      : index === 8
                        ? styles.printSheetMoney
                        : undefined
                  }
                  key={sheet.columns[index]}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={7} scope="row">
              {sheet.totalsRow[0]}
            </th>
            <td>{sheet.totalsRow[1]}</td>
            <td className={styles.printSheetMoney}>{sheet.totalsRow[2]}</td>
          </tr>
        </tfoot>
      </table>

      <div className={styles.printSheetSignatures}>
        <span>{labels.driverSignature}</span>
        <span>{labels.checkedBy}</span>
        <span>{labels.date}</span>
      </div>
    </div>,
    document.body,
  )
}
