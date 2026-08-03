/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { CTE_PROFILE_MATCH_ROLE, type CteProfileMatcher } from '../shared/cteProfiles.types'
import type { ProfileFormState } from '../shared/cteProfilesForm.service'
import styles from '../styles/cteProfiles.module.css'
import { ProfileField, ProfileSelectField } from './ProfileField.component'

type CteProfileMatcherFieldsProps = Readonly<{
  matchers: readonly CteProfileMatcher[]
  onChange: (patch: Partial<ProfileFormState>) => void
}>

const EMPTY_MATCHER: CteProfileMatcher = { matchRole: 'sender', taxId: '' }

export function CteProfileMatcherFields({ matchers, onChange }: CteProfileMatcherFieldsProps) {
  const { t } = useTranslation('cteProfiles')

  function replaceMatcher(index: number, patch: Partial<CteProfileMatcher>) {
    onChange({
      matchers: matchers.map((matcher, position) =>
        position === index ? { ...matcher, ...patch } : matcher,
      ),
    })
  }

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('matchersLegend')}</legend>
      {matchers.length === 0 ? <p className={styles.emptyGroup}>{t('matchersEmpty')}</p> : null}
      {matchers.map((matcher, index) => (
        <div className={styles.repeatableRow} key={`matcher-${String(index)}`}>
          <div className={styles.fieldGrid}>
            <ProfileSelectField
              label={t('matchRole')}
              optionLabelKey="matchRoleOption"
              options={CTE_PROFILE_MATCH_ROLE}
              value={matcher.matchRole}
              onChange={(matchRole) => replaceMatcher(index, { matchRole })}
            />
            <ProfileField
              inputMode="numeric"
              label={t('taxId')}
              maxLength={14}
              value={matcher.taxId}
              onChange={(taxId) => replaceMatcher(index, { taxId })}
            />
          </div>
          <div className={styles.formActions}>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                onChange({ matchers: matchers.filter((_item, position) => position !== index) })
              }
            >
              <Icon name="remove" />
              {t('removeMatcher')}
            </Button>
          </div>
        </div>
      ))}
      <div className={styles.formActions}>
        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => onChange({ matchers: [...matchers, EMPTY_MATCHER] })}
        >
          <Icon name="add" />
          {t('addMatcher')}
        </Button>
      </div>
    </fieldset>
  )
}
