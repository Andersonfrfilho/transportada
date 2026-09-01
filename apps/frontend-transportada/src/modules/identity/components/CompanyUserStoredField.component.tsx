import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/userAdministration.module.css'

type CompanyUserStoredFieldProps = Readonly<{
  editor: ReactNode
  isEditing: boolean
  label: string
  onEdit: () => void
  onStopEditing: () => void
  value: string
  canReveal?: boolean
  isRevealing?: boolean
  isVisible?: boolean
  onReveal?: () => void
}>

/**
 * Um dado guardado, num lugar só: o valor que já existe, o olho que o revela e o lápis que abre o
 * campo para trocá-lo — tudo na mesma linha.
 *
 * Antes eram dois blocos: os campos de edição em cima, abrindo vazios, e uma lista somente-leitura
 * embaixo com os valores mascarados. Quem abria o diálogo via "E-mail de acesso" em branco num lugar
 * e "E-mail guardado: a***@g***.com" em outro, sem nada ligando os dois — e concluía, com razão, que
 * faltava botão de editar.
 *
 * O campo continua abrindo **vazio** ao entrar em edição: o valor que a API entrega é mascarado, e
 * pré-preencher com ele gravaria `a***@g***.com` por cima do endereço bom.
 */
export function CompanyUserStoredField({
  canReveal = false,
  editor,
  isEditing,
  isRevealing = false,
  isVisible = false,
  label,
  onEdit,
  onReveal,
  onStopEditing,
  value,
}: CompanyUserStoredFieldProps) {
  const { t } = useTranslation('identity')

  return (
    <div className={styles.storedField}>
      <div className={styles.storedFieldHead}>
        <span className={styles.storedFieldLabel}>{label}</span>
        <span className={styles.secretRow}>
          <span className={styles.storedFieldValue}>{value || '—'}</span>
          {!canReveal || isVisible || value === '' || onReveal === undefined ? null : (
            <Button
              aria-label={t('users.editDialog.revealField', { field: label })}
              disabled={isRevealing}
              onClick={onReveal}
              size="sm"
              title={t('users.editDialog.revealField', { field: label })}
              type="button"
              variant="ghost"
            >
              <Icon name="eye" />
            </Button>
          )}
          {isEditing ? (
            <Button onClick={onStopEditing} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('users.editDialog.cancelEdit')}
            </Button>
          ) : (
            <Button onClick={onEdit} size="sm" type="button" variant="ghost">
              <Icon name="edit" />
              {t('users.editDialog.edit')}
            </Button>
          )}
        </span>
      </div>
      {isEditing ? editor : null}
    </div>
  )
}
