/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'

import styles from '../styles/canhotoPickup.module.css'

type CanhotoPickupFlagProps = Readonly<{
  /** `retained` é a nota de origem ("canhoto retido"); `pickup` é a coleta na viagem nova. */
  variant: 'pickup' | 'retained'
}>

/**
 * Spec 321 D4d: a flag com tooltip. Ícone + palavra + cor (nunca só a cor), mesma família do selo
 * "Canhoto pendente" (spec 223): sinaliza, não é ação.
 */
export function CanhotoPickupFlag({ variant }: CanhotoPickupFlagProps) {
  const { t } = useTranslation('trip')

  return (
    <Tooltip label={t(`canhotoPickup.flag.${variant}.hint`)}>
      <span className={styles.flag} data-variant={variant}>
        <Icon name="document" size="sm" />
        {t(`canhotoPickup.flag.${variant}.badge`)}
      </span>
    </Tooltip>
  )
}
