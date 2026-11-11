/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { classifyVehiclePlate, formatVehiclePlateText } from '../shared/vehiclePlate.service'
import styles from '../styles/vehiclePlate.module.css'

type DriverVehiclePlateProps = Readonly<{
  plate: string
}>

/**
 * A placa desenhada no modelo dela (Mercosul ou antiga). As cores são as da placa real e **não**
 * seguem o tema: a placa é um objeto físico, e fundo claro com caractere preto lê nos dois temas.
 * Formato desconhecido cai para texto simples.
 */
export function DriverVehiclePlate({ plate }: DriverVehiclePlateProps) {
  const { t } = useTranslation('driverTrip')
  const model = classifyVehiclePlate(plate)
  const text = formatVehiclePlateText(plate)

  if (model === 'unknown') return <span className={styles.plainPlate}>{plate}</span>

  const isMercosul = model === 'mercosul'
  return (
    <svg
      aria-label={t(isMercosul ? 'plate.mercosul' : 'plate.legacy', { plate: text })}
      className={styles.plate}
      role="img"
      viewBox="0 0 100 34"
    >
      <rect
        fill={isMercosul ? '#ffffff' : '#c4c7cb'}
        height="32"
        rx="4"
        stroke="#1a1a1a"
        strokeWidth="1.6"
        width="98"
        x="1"
        y="1"
      />
      {isMercosul ? (
        <>
          <path d="M2 3a4 4 0 0 1 4-1h88a4 4 0 0 1 4 1v7H2z" fill="#003399" />
          <text
            fill="#ffffff"
            fontFamily="Arial, sans-serif"
            fontSize="5.2"
            fontWeight="700"
            letterSpacing=".6"
            textAnchor="middle"
            x="50"
            y="8.2"
          >
            BRASIL
          </text>
          <circle cx="9" cy="6" fill="#ffffff" opacity=".9" r="2.4" />
          <circle cx="91" cy="6" fill="#ffd200" r="2.4" />
        </>
      ) : null}
      <text
        fill="#111111"
        fontFamily="'DIN Alternate', 'Arial Narrow', Arial, sans-serif"
        fontSize={isMercosul ? 17 : 18}
        fontWeight="700"
        letterSpacing="1"
        textAnchor="middle"
        x="50"
        y={isMercosul ? 27 : 23}
      >
        {text}
      </text>
    </svg>
  )
}
