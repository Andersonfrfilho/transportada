/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { formatPostalCode } from '@/modules/shared/postalCode.service'

import type { AddressReport, AddressFinding } from '../shared/addressReport.validation'
import styles from '../styles/addressReport.module.css'

type AddressReportPanelProps = Readonly<{
  denied: boolean
  failed: boolean
  loading: boolean
  report: AddressReport | undefined
}>

function AddressReportSkeleton() {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <SkeletonGroup label={t('addressReport.title')}>
      <Skeleton variant="text" width="24rem" />
      <Skeleton height="3rem" width="100%" />
      <Skeleton height="3rem" width="100%" />
      <Skeleton height="3rem" width="100%" />
    </SkeletonGroup>
  )
}

/**
 * O relatório de endereços a corrigir (spec 084, G10).
 *
 * ⚠️ **O denominador aparece na primeira linha, sempre.** "24 endereços a corrigir" sozinho parece
 * uma base podre; "24 de 148 medidos" diz que o cadastro está majoritariamente bom. O relatório é
 * feito para ser mandado a um cliente, e a diferença entre um pedido e uma acusação está aí.
 */
export function AddressReportPanel({ denied, failed, loading, report }: AddressReportPanelProps) {
  const { t } = useTranslation('nfeWorkspace')

  if (denied) return <p className={styles.notice}>{t('addressReport.denied')}</p>
  if (failed) return <p className={styles.notice}>{t('addressReport.failed')}</p>
  if (loading || report === undefined) return <AddressReportSkeleton />

  if (report.totals.measured === 0) {
    return <p className={styles.notice}>{t('addressReport.notMeasured')}</p>
  }

  if (report.groups.length === 0) {
    return (
      <p className={styles.notice}>
        {t('addressReport.empty', { measured: report.totals.measured })}
      </p>
    )
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{t('addressReport.title')}</h2>
      <p className={styles.summary}>
        {t('addressReport.summary', {
          measured: report.totals.measured,
          needingAttention: report.totals.needingAttention,
        })}
      </p>

      {report.groups.map((group) => (
        <article className={styles.group} key={group.contractorTaxId || group.contractorName}>
          <header className={styles.groupHeader}>
            <h3 className={styles.groupName}>
              {group.contractorName || t('addressReport.contractorWithout')}
            </h3>
            <span className={styles.groupCount}>{group.findings.length}</span>
          </header>

          <ul className={styles.findings}>
            {group.findings.map((finding) => (
              <FindingRow finding={finding} key={finding.addressKey} />
            ))}
          </ul>
        </article>
      ))}
    </section>
  )
}

function FindingRow({ finding }: Readonly<{ finding: AddressFinding }>) {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <li className={styles.finding}>
      <Tooltip label={t(`addressReport.kindHelp.${finding.kind}`)}>
        <span className={styles.kind} data-kind={finding.kind}>
          <Icon aria-hidden="true" name="alert" size="sm" />
          {t(`addressReport.kind.${finding.kind}`)}
        </span>
      </Tooltip>

      <div className={styles.sides}>
        <p className={styles.side}>
          <span className={styles.sideLabel}>{t('addressReport.noteLabel')}</span>
          {`${finding.noteStreet}, ${finding.noteNumber} — ${finding.city}/${finding.state}`}
          {finding.notePostalCode.length === 0
            ? ''
            : ` · ${formatPostalCode(finding.notePostalCode)}`}
        </p>
        <p className={styles.side}>
          <span className={styles.sideLabel}>{t('addressReport.providerLabel')}</span>
          {finding.providerStreet.length === 0 ? (
            <em className={styles.unknown}>{t('addressReport.unknownStreet')}</em>
          ) : (
            <>
              {finding.providerStreet}
              {finding.providerPostalCode.length === 0
                ? ''
                : ` · ${formatPostalCode(finding.providerPostalCode)}`}
            </>
          )}
        </p>
      </div>

      {finding.distanceMetres === null ? null : (
        <p className={styles.distance}>
          {t('addressReport.distance', { metres: Math.round(finding.distanceMetres) })}
        </p>
      )}
    </li>
  )
}
