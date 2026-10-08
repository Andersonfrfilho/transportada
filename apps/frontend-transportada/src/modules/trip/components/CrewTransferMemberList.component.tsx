/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { CrewTransferMember } from '../shared/tripCrewTransfer.types'
import styles from '../styles/trip.module.css'

const CREW_ROLES = ['driver', 'helper'] as const

type CrewTransferMemberListProps = Readonly<{
  members: readonly CrewTransferMember[]
}>

export function CrewTransferMemberList({ members }: CrewTransferMemberListProps) {
  const { t } = useTranslation('trip')

  if (members.length === 0) return <p>{t('crewTransferDialog.summary.nobody')}</p>

  return (
    <ul className={styles.crewTransferRoles}>
      {CREW_ROLES.map((role) => {
        const names = members.filter((member) => member.role === role).map((member) => member.name)
        if (names.length === 0) return null
        return (
          <li key={role}>
            <span>{t(`crewTransferDialog.roleGroup.${role}`)}:</span> {names.join(', ')}
          </li>
        )
      })}
    </ul>
  )
}
