/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { fromRateFraction } from '../shared/cteProfilesDecimal.service'
import type { CteProfileDetail, CteProfileVersionInput } from '../shared/cteProfiles.types'
import styles from '../styles/cteProfiles.module.css'

type CteProfileListProps = Readonly<{
  onActivate: (input: CteProfileVersionInput) => void
  onDeactivate: (input: CteProfileVersionInput) => void
  onEdit: (profile: CteProfileDetail) => void
  profiles: readonly CteProfileDetail[]
  selectedProfileId?: string
}>

export function CteProfileList({
  onActivate,
  onDeactivate,
  onEdit,
  profiles,
  selectedProfileId,
}: CteProfileListProps) {
  const { t } = useTranslation('cteProfiles')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.profileTable}>
        <thead>
          <tr>
            <th scope="col">{t('columnName')}</th>
            <th scope="col">{t('columnStatus')}</th>
            <th scope="col">{t('columnPriority')}</th>
            <th scope="col">{t('columnPercentage')}</th>
            <th scope="col">{t('columnGrouping')}</th>
            <th scope="col">{t('columnActions')}</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr aria-selected={profile.id === selectedProfileId} key={profile.id}>
              <td>{profile.name}</td>
              <td>
                <span
                  className={
                    profile.status === 'active'
                      ? `${styles.statusBadge} ${styles.statusActive}`
                      : styles.statusBadge
                  }
                >
                  {t(`status.${profile.status}`)}
                </span>
              </td>
              <td>{profile.priority}</td>
              <td>{`${fromRateFraction(profile.freightRule.percentage)}%`}</td>
              <td>{t(`groupingModeOption.${profile.groupingMode}`)}</td>
              <td>
                <div className={styles.rowActions}>
                  <Button size="sm" type="button" variant="ghost" onClick={() => onEdit(profile)}>
                    {t('edit')}
                  </Button>
                  {profile.status === 'active' ? (
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        onDeactivate({
                          expectedVersion: profile.version,
                          profileId: profile.id,
                        })
                      }
                    >
                      {t('deactivate')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        onActivate({ expectedVersion: profile.version, profileId: profile.id })
                      }
                    >
                      {t('activate')}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
