/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { VEHICLE_TYPE_ICONS } from '@/modules/shared/vehicleTypeIcon.service'
import type { VehicleType } from '@/modules/shared/vehicleType.constant'

import styles from '../styles/fleet.module.css'

export type VehicleIdentityFact = Readonly<{ label: string; note?: null | string; value: string }>

type VehicleIdentityBandProps = Readonly<{
  facts: readonly VehicleIdentityFact[]
  label: null | string
  /** Uma linha curta de ficha: baú, eixos, porta. `null` some, nunca vira "—". */
  specification: null | string
  plate: null | string
  vehicleType: '' | VehicleType
}>

/**
 * Spec 110 D3: **o caminhão na frente, antes de qualquer número.**
 *
 * Abrir uma viagem proposta punha o operador direto num mapa; qual veículo era aquele estava três
 * blocos abaixo, no painel de carga. Aqui ele é a primeira coisa: o ícone do tipo em destaque, a
 * ficha ao lado e os números que decidem se a carga cabe.
 *
 * ⚠️ O ícone vem de `VEHICLE_TYPE_ICONS`, do design system — `<svg>` cru fora de `components/ui` é
 * proibido, e o mapa é total por construção: tipo novo no catálogo não passa sem desenho.
 *
 * ⚠️ **Compartilhado com a criação manual** (D8): duas faixas com a mesma informação e caras
 * diferentes é a divergência que o `web.md` §14 reprova.
 */
export function VehicleIdentityBand({
  facts,
  label,
  plate,
  specification,
  vehicleType,
}: VehicleIdentityBandProps) {
  const { t } = useTranslation('fleet')

  return (
    <section className={styles.identityBand}>
      <span className={styles.identityMark}>
        {vehicleType === '' ? (
          <Icon name="vehicle-other" />
        ) : (
          <Icon name={VEHICLE_TYPE_ICONS[vehicleType]} />
        )}
      </span>
      <div className={styles.identityFacts}>
        <div className={styles.identityTitle}>
          <strong>{label ?? t('identityBand.withoutModel')}</strong>
          {plate === null ? null : <span className={styles.identityPlate}>{plate}</span>}
        </div>
        {specification === null ? null : (
          <p className={styles.identitySpecification}>{specification}</p>
        )}
        <dl className={styles.identityChips}>
          {facts.map((fact) => (
            <div className={styles.identityChip} key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>
                {fact.value}
                {fact.note === null || fact.note === undefined ? null : (
                  <span className={styles.identityChipNote}> {fact.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
