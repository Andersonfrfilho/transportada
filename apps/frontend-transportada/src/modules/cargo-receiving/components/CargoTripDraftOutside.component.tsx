/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CargoPreviewItemState } from '../shared/cargoPreview.types'
import type { CargoPreviewTripDrafts } from '../shared/cargoPreviewTripDraft.types'
import { describeTripDraftOutside } from '../shared/cargoPreviewTripDraftView.service'
import styles from '../styles/cargoTripDraft.module.css'

type CargoTripDraftOutsideProps = Readonly<{
  drafts: CargoPreviewTripDrafts
  /** Leva ao detalhe da prévia filtrado pelo estado, sem sair da tela. */
  onShowState: (state: CargoPreviewItemState) => void
}>

/** O que não entra na recomendação agora, e por quê — com o atalho de volta às linhas daquele estado. */
export function CargoTripDraftOutside({
  drafts,
  onShowState,
}: CargoTripDraftOutsideProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const outside = describeTripDraftOutside(drafts)
  if (!outside.hasAny) return null

  return (
    <section className={styles.outside} data-trip-draft-outside="">
      <h3>{t('preview.drafts.outside.title')}</h3>
      <p className={styles.notice}>{t('preview.drafts.outside.hint')}</p>
      <ul className={styles.outsideList}>
        {outside.entries.map((entry) => (
          <li className={styles.outsideItem} key={entry.kind}>
            <span>{t(`preview.drafts.outside.${entry.kind}`, { count: entry.count })}</span>
            <Button onClick={() => onShowState(entry.state)} type="button" variant="ghost">
              <Icon name="filter" />
              {t(`preview.drafts.outside.show.${entry.kind}`)}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
