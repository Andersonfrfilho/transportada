/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useDriverMemberships } from '../hooks/useDriverMemberships.hook'
import { resolveMembershipEntryMode } from '../shared/driverMembership.service'
import { FLEET_FIELD_ENTRY_MODE } from '../shared/fleet.types'
import styles from '../styles/fleet.module.css'

const MEMBERSHIP_ID_LENGTH = 36

type DriverMembershipFieldProps = Readonly<{
  onChange: (value: string) => void
  value: string
}>

/**
 * O vínculo é um UUID de 36 caracteres: digitá-lo à mão é errar um dígito e descobrir no primeiro
 * login que falhou. Sem `users.manage` a lista não vem, e o campo volta a ser teclado — quem cuida
 * da frota sem administrar usuários ainda precisa cadastrar motorista.
 */
export function DriverMembershipField({ onChange, value }: DriverMembershipFieldProps) {
  const { t } = useTranslation('fleet')
  const memberships = useDriverMemberships({ selected: value })
  const mode = resolveMembershipEntryMode({
    canReadUsers: memberships.canReadUsers,
    choiceCount: memberships.choices.length,
    isLoading: memberships.isLoading,
  })

  function renderControl(): ReactNode {
    if (memberships.isLoading) {
      return (
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      )
    }
    if (mode === FLEET_FIELD_ENTRY_MODE.TEXT) {
      return (
        <input
          maxLength={MEMBERSHIP_ID_LENGTH}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }
    return (
      <Select
        ariaLabel={t('driverMembership')}
        clearable
        options={memberships.choices}
        placeholder={t('driverMembershipUnset')}
        searchPlaceholder={t('driverMembershipSearch')}
        value={value}
        onChange={onChange}
      />
    )
  }

  return (
    <label>
      <span>
        {t('driverMembership')}
        <em className={styles.optionalMark}>{t('optionalMark')}</em>
      </span>
      {renderControl()}
    </label>
  )
}
