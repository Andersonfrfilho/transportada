/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'
import { formatTaxId } from '@/modules/shared/taxId.service'

import { useReceivingProfileQuery } from '../queries/useReceivingProfile.query'
import type { Contractor } from '../shared/contractorDirectory.types'
import styles from '../styles/contractorDirectory.module.css'
import { ContractorDetailsForm } from './ContractorDetailsForm.component'
import { ReceivingProfileForm } from './ReceivingProfileForm.component'

type ContractorFichaProps = Readonly<{
  canManage: boolean
  contractor: Contractor
  onClose: () => void
}>

/** A ficha abre abaixo da lista, como a do cliente: dados do contratante e o perfil de recebimento dele. */
export function ContractorFicha({
  canManage,
  contractor,
  onClose,
}: ContractorFichaProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const { panelRef } = useRevealedPanel<HTMLElement>()
  const titleId = useId()
  const profile = useReceivingProfileQuery(contractor.id)
  const name = contractor.displayName === '' ? t('table.unnamed') : contractor.displayName

  return (
    <section aria-labelledby={titleId} className={styles.ficha} ref={panelRef}>
      <header className={styles.fichaHeader}>
        <div>
          <h3 id={titleId}>{name}</h3>
          <p className={styles.hint}>
            {t('ficha.taxId', { taxId: formatTaxId(contractor.taxId) })}
          </p>
        </div>
        <Button onClick={onClose} type="button" variant="ghost">
          <Icon name="close" />
          {t('ficha.close')}
        </Button>
      </header>

      {canManage ? null : <p className={styles.hint}>{t('ficha.readOnly')}</p>}

      <div className={styles.fichaColumns}>
        <ContractorDetailsForm contractor={contractor} isDisabled={!canManage} />
        {profile.isPending ? (
          <SkeletonGroup label={t('ficha.loadingProfile')}>
            <Skeleton height="12rem" />
          </SkeletonGroup>
        ) : profile.isError ? (
          <p className={styles.error} role="alert">
            {t('ficha.profileError', { code: profile.error.message })}
          </p>
        ) : (
          <ReceivingProfileForm
            contractorId={contractor.id}
            isDisabled={!canManage}
            profile={profile.data}
          />
        )}
      </div>
    </section>
  )
}
