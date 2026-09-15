/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'

import { AddressCorrectionForm } from './AddressCorrectionForm.component'
import { formatNfeImportMoment } from '../shared/nfeImportMoment.service'
import {
  findDraftRequest,
  initialAddressCorrectionFields,
  resolveAddressCorrectionStatus,
  type AddressCorrectionStatus,
} from '../shared/addressCorrectionStatus.service'
import type { AddressCorrectionRequestRecord } from '../shared/addressCorrection.validation'
import type { AddressReport, AddressFinding } from '../shared/addressReport.validation'
import styles from '../styles/addressReport.module.css'

type AddressReportPanelProps = Readonly<{
  correctionRequests: readonly AddressCorrectionRequestRecord[] | undefined
  correctionRequestsFailed: boolean
  correctionRequestsLoading: boolean
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
export function AddressReportPanel({
  correctionRequests,
  correctionRequestsFailed,
  correctionRequestsLoading,
  denied,
  failed,
  loading,
  report,
}: AddressReportPanelProps) {
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
              <FindingRow
                correctionRequests={correctionRequests}
                correctionRequestsFailed={correctionRequestsFailed}
                correctionRequestsLoading={correctionRequestsLoading}
                finding={finding}
                key={finding.addressKey}
              />
            ))}
          </ul>
        </article>
      ))}
    </section>
  )
}

type FindingRowProps = Readonly<{
  correctionRequests: readonly AddressCorrectionRequestRecord[] | undefined
  correctionRequestsFailed: boolean
  correctionRequestsLoading: boolean
  finding: AddressFinding
}>

function FindingRow({
  correctionRequests,
  correctionRequestsFailed,
  correctionRequestsLoading,
  finding,
}: FindingRowProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [isCorrectionOpen, setCorrectionOpen] = useState(false)
  const requestsForAddress =
    correctionRequests?.filter((request) => request.addressKey === finding.addressKey) ?? []
  const status = resolveAddressCorrectionStatus(requestsForAddress)
  const draft = findDraftRequest(finding.addressKey, requestsForAddress)

  return (
    <li className={styles.finding}>
      <Tooltip label={t(`addressReport.kindHelp.${finding.kind}`)}>
        <span className={styles.kind} data-kind={finding.kind}>
          <Icon aria-hidden="true" name="alert" size="sm" />
          {t(`addressReport.kind.${finding.kind}`)}
        </span>
      </Tooltip>

      <AddressCorrectionStatusBadge
        failed={correctionRequestsFailed}
        loading={correctionRequestsLoading}
        status={status}
      />

      <div className={styles.sides}>
        <p className={styles.side}>
          <span className={styles.sideLabel}>{t('addressReport.noteLabel')}</span>
          {`${finding.noteStreet}, ${finding.noteNumber} — ${finding.city}/${finding.state}`}
          {finding.notePostalCode.length === 0 ? '' : ` · ${finding.notePostalCode}`}
        </p>
        {status.proposedSummary === null ? null : (
          <p className={styles.side}>
            <span className={styles.sideLabel}>{t('addressReport.correction.proposedLabel')}</span>
            {status.proposedSummary}
          </p>
        )}
        {/**
         * ⚠️ **O não localizado não tem lado do provedor** (ADR-0062). A rotina paga guarda o
         * carimbo, nunca o que o provedor respondeu — então imprimir "o provedor conhece: não
         * conhece este logradouro" aqui seria afirmar o que não foi medido. O que a pessoa precisa
         * saber é para onde a entrega está apontando hoje.
         */}
        {finding.kind === 'coordinate_unresolved' ? (
          <p className={styles.side}>
            <em className={styles.unknown}>{t('addressReport.unresolvedAim')}</em>
          </p>
        ) : (
          <p className={styles.side}>
            <span className={styles.sideLabel}>{t('addressReport.providerLabel')}</span>
            {finding.providerStreet.length === 0 ? (
              <em className={styles.unknown}>{t('addressReport.unknownStreet')}</em>
            ) : (
              <>
                {finding.providerStreet}
                {finding.providerPostalCode.length === 0 ? '' : ` · ${finding.providerPostalCode}`}
              </>
            )}
          </p>
        )}
      </div>

      {finding.distanceMetres === null ? null : (
        <p className={styles.distance}>
          {t('addressReport.distance', { metres: Math.round(finding.distanceMetres) })}
        </p>
      )}

      {isCorrectionOpen ? (
        <AddressCorrectionForm
          addressKey={finding.addressKey}
          initial={initialAddressCorrectionFields({ draft, finding })}
          onCancel={() => setCorrectionOpen(false)}
          onSaved={() => setCorrectionOpen(false)}
        />
      ) : (
        <Button
          className={styles.correctionTrigger}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setCorrectionOpen(true)}
        >
          <Icon name="edit" />
          {t(
            draft === undefined
              ? 'addressReport.correction.trigger'
              : 'addressReport.correction.editTrigger',
          )}
        </Button>
      )}
    </li>
  )
}

/**
 * O selo de estado do pedido (spec 150, T202) — reaproveita `Badge`, o mesmo selo usado em
 * `BillingDefaultsFields` e nas tabelas de NFS-e/MDF-e, em vez de um visual próprio da aba.
 * Enquanto a lista carrega, o esqueleto tem a forma do selo; se ela falhar, um aviso discreto
 * substitui o selo sem esconder a falha nem travar o resto da linha.
 */
function AddressCorrectionStatusBadge({
  failed,
  loading,
  status,
}: Readonly<{ failed: boolean; loading: boolean; status: AddressCorrectionStatus }>) {
  const { t } = useTranslation('nfeWorkspace')

  if (loading) return <Skeleton height="1.2rem" variant="text" width="7rem" />
  if (failed) {
    return (
      <small className={styles.correctionStatusNotice}>
        {t('addressReport.correction.statusUnavailable')}
      </small>
    )
  }

  if (status.state === 'sent') {
    return (
      <Badge variant="success">
        {t('addressReport.correction.stateSent', {
          date: status.sentAt === null ? '' : formatNfeImportMoment(status.sentAt),
        })}
      </Badge>
    )
  }

  if (status.state === 'draft') {
    return (
      <span className={styles.correctionStatusGroup}>
        <Badge variant="default">{t('addressReport.correction.stateDraft')}</Badge>
        {status.lastSentAt === null ? null : (
          <small className={styles.correctionStatusHint}>
            {t('addressReport.correction.lastSentAt', {
              date: formatNfeImportMoment(status.lastSentAt),
            })}
          </small>
        )}
      </span>
    )
  }

  return <Badge variant="secondary">{t('addressReport.correction.stateNone')}</Badge>
}
