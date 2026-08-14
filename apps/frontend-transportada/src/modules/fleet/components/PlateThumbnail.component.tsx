/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { describePlateCharacters } from '../shared/fleetPlate.service'
import styles from '../styles/fleet.module.css'

type PlateThumbnailProps = Readonly<{ plate: string }>

export function PlateThumbnail({ plate }: PlateThumbnailProps) {
  const { t } = useTranslation('fleet')
  const characters = describePlateCharacters(plate)

  return (
    // Espelho do campo ao lado: anunciar de novo faria o leitor de tela ler a placa duas vezes
    <div aria-hidden="true" className={styles.plate}>
      <div className={styles.plateBand}>
        <span className={styles.plateBloc}>{t('plateBloc')}</span>
        <span className={styles.plateCountry}>{t('plateCountry')}</span>
        <span className={styles.plateFlag} />
      </div>
      <div className={styles.plateBody}>
        <span className={styles.plateCountryCode}>{t('plateCountryCode')}</span>
        <div className={styles.plateCharacters}>
          {characters.map((character, position) => (
            <span
              className={character === '' ? styles.plateCharacterEmpty : styles.plateCharacter}
              key={position}
            >
              {character}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
