import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  PLATE_STANDARD,
  describePlateGroups,
  describePlateStandard,
} from '../shared/fleetPlate.service'
import styles from '../styles/fleet.module.css'

type PlateThumbnailProps = Readonly<{
  plate: string
  state?: string
}>

function renderCharacters(characters: readonly string[], group: string) {
  return characters.map((character, position) => (
    <span
      className={character === '' ? styles.plateCharacterEmpty : styles.plateCharacter}
      key={`${group}-${position}`}
    >
      {character}
    </span>
  ))
}

export function PlateThumbnail({ plate, state = '' }: PlateThumbnailProps) {
  const { t } = useTranslation('fleet')
  const isLegacy = describePlateStandard(plate) === PLATE_STANDARD.LEGACY
  const { prefix, suffix } = describePlateGroups(plate)

  return (
    <div aria-hidden="true" className={cn(styles.plate, isLegacy && styles.plateLegacy)}>
      {isLegacy ? (
        <div className={cn(styles.plateBand, styles.plateLegacyBand)}>
          <span className={styles.plateOrigin}>{state}</span>
        </div>
      ) : (
        <div className={styles.plateBand}>
          <span className={styles.plateBloc}>{t('plateBloc')}</span>
          <span className={styles.plateCountry}>{t('plateCountry')}</span>
          <span className={styles.plateFlag} />
        </div>
      )}
      <div className={styles.plateBody}>
        {isLegacy ? null : <span className={styles.plateCountryCode}>{t('plateCountryCode')}</span>}
        <div className={styles.plateCharacters}>
          <div className={styles.plateGroup}>{renderCharacters(prefix, 'prefix')}</div>
          {isLegacy ? <span className={styles.plateSeparator} /> : null}
          <div className={styles.plateGroup}>{renderCharacters(suffix, 'suffix')}</div>
        </div>
      </div>
    </div>
  )
}
