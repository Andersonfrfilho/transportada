/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Icon } from '@/components/ui/icon'

import styles from './mailCopyChips.module.css'

export type MailCopyChip = Readonly<{ hint: string; id: string; name: string }>

type MailCopyChipsProps = Readonly<{
  chips: readonly MailCopyChip[]
  isDisabled: boolean
  /** O texto de quando a lista efetiva não tem ninguém. */
  emptyLabel: string
  label: string
  onRemove: (id: string) => void
  removeLabel: (name: string) => string
}>

/**
 * Spec 267 RF4: a linha "Cópia:" dos diálogos de envio à contratante. Só mostra e tira — adicionar gente ou digitar
 * endereço não existe aqui; a lista vem da API (responsáveis ativos e elegíveis) e a remoção vale só para o envio.
 */
export function MailCopyChips({
  chips,
  emptyLabel,
  isDisabled,
  label,
  onRemove,
  removeLabel,
}: MailCopyChipsProps) {
  return (
    <div>
      <span>{label}</span>
      {chips.length === 0 ? (
        <p className={styles.empty}>{emptyLabel}</p>
      ) : (
        <ul aria-label={label} className={styles.chips}>
          {chips.map((chip) => (
            <li className={styles.chip} key={chip.id}>
              <span>{chip.name}</span>
              <span className={styles.chipHint}>{chip.hint}</span>
              <button
                aria-label={removeLabel(chip.name)}
                className={styles.remove}
                disabled={isDisabled}
                onClick={() => onRemove(chip.id)}
                type="button"
              >
                <Icon name="close" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
