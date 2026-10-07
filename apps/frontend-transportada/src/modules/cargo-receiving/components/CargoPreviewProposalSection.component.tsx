/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { CARGO_PREVIEW_DEFAULT_LOCALE } from '../shared/cargoPreview.constant'
import type { CargoPreviewProposalController } from '../hooks/useCargoPreviewProposal.hook'
import type { CargoPreviewDetail } from '../shared/cargoPreview.types'
import { formatPlannedDate } from '../shared/cargoPreviewFormat.service'
import {
  resolveProposalAvailability,
  type CargoPreviewProposalView,
} from '../shared/cargoPreviewProposal.service'
import detailStyles from '../styles/cargoPreviewDetail.module.css'
import { resolvePreviewErrorKeys } from '../shared/cargoPreviewRefusal.service'
import styles from '../styles/cargoReceiving.module.css'

type CargoPreviewProposalSectionProps = Readonly<{
  canManage: boolean
  header: CargoPreviewDetail
  proposal: CargoPreviewProposalController
}>

function RefusedDocuments({
  refused,
}: Readonly<{ refused: CargoPreviewProposalView['refused'] }>): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (refused.length === 0) return null
  return (
    <>
      <p>{t('preview.proposal.refusedLead')}</p>
      <ul className={detailStyles.proposalList}>
        {refused.map((entry) => (
          <li key={entry.documentId}>
            {entry.number === undefined
              ? t('preview.proposal.unknownDocument')
              : t('document.number', { number: entry.number })}
            {': '}
            {t(`refusal.reasons.${entry.reason}`, { defaultValue: entry.reason })}
          </li>
        ))}
      </ul>
    </>
  )
}

function ProposalDraft({
  header,
  proposal,
}: Readonly<{
  header: CargoPreviewDetail
  proposal: CargoPreviewProposalController
}>): JSX.Element | null {
  const { t, i18n } = useTranslation('cargoReceiving')
  const { view } = proposal
  if (view === undefined || proposal.proposal === undefined) return null
  const plannedDate = formatPlannedDate({
    locale: i18n.resolvedLanguage ?? CARGO_PREVIEW_DEFAULT_LOCALE,
    value: proposal.proposal.plannedDate,
  })

  return (
    <section className={detailStyles.proposal} data-proposal="">
      <h2>{t('preview.proposal.title')}</h2>
      <p>
        {t('preview.proposal.facts', {
          contractor: header.contractorName ?? t('preview.unknownContractor'),
          date: plannedDate,
        })}
      </p>
      <p>
        {view.canRegister
          ? t('preview.proposal.entering', { count: view.enteringCount })
          : t('preview.proposal.none')}
      </p>
      <RefusedDocuments refused={view.refused} />
      {view.canRegister ? (
        <div className={styles.actions}>
          <Button onClick={proposal.register} type="button">
            <Icon name="add" />
            {t('preview.proposal.register')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

/**
 * RF5b: a prévia propõe a chegada e o operador só confirma a hora. Sem nota vinculada o botão não fica
 * morto: some e uma frase explica que as notas entram quando o XML chegar.
 */
export function CargoPreviewProposalSection({
  canManage,
  header,
  proposal,
}: CargoPreviewProposalSectionProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (!canManage) return null
  const availability = resolveProposalAvailability({
    matchedCount: header.counts.matched,
    status: header.status,
  })

  if (availability === 'not-ready') {
    return (
      <p className={styles.hint}>
        {header.status === 'failed' ? t('preview.proposal.failed') : t('preview.proposal.notReady')}
      </p>
    )
  }
  if (availability === 'no-matched')
    return <p className={styles.hint}>{t('preview.proposal.noMatched')}</p>

  return (
    <>
      <div className={styles.actions}>
        <Button
          disabled={proposal.isPending}
          onClick={proposal.propose}
          type="button"
          variant="secondary"
        >
          <Icon name="document" />
          {proposal.isPending ? t('preview.proposal.proposing') : t('preview.proposal.propose')}
        </Button>
      </div>
      {proposal.errorCode === undefined ? null : (
        <p className={styles.error} data-proposal-error="" role="alert">
          {t(resolvePreviewErrorKeys(proposal.errorCode), {
            code: proposal.errorCode,
          })}
        </p>
      )}
      <ProposalDraft header={header} proposal={proposal} />
    </>
  )
}
