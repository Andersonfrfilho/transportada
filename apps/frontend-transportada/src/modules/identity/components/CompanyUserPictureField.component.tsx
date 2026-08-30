/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import styles from '../styles/userAdministration.module.css'

type CompanyUserPictureFieldProps = Readonly<{
  isLoading: boolean
  isPending: boolean
  name: string
  onRemove: () => void
  onSelect: (file: File) => void
  pictureUrl: string | null
}>

/** Aceito no envio; o servidor confere a assinatura do arquivo e não confia neste atributo. */
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp'

/**
 * O avatar da pessoa, na ficha dela. Ele é imagem de dado pessoal servida por rota autenticada: a
 * tela busca os bytes e desenha uma URL de objeto, porque `<img src>` não manda o token.
 */
export function CompanyUserPictureField({
  isLoading,
  isPending,
  name,
  onRemove,
  onSelect,
  pictureUrl,
}: CompanyUserPictureFieldProps) {
  const { t } = useTranslation('identity')
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={styles.pictureField}>
      {isLoading ? (
        <Skeleton height="4rem" variant="block" width="4rem" />
      ) : pictureUrl === null ? (
        /* Sem foto, as iniciais: um retângulo vazio não diz de quem é a ficha. */
        <span aria-hidden="true" className={styles.pictureFallback}>
          {initialsOf(name)}
        </span>
      ) : (
        <img alt={t('users.picture.alt', { name })} className={styles.picture} src={pictureUrl} />
      )}

      <div className={styles.pictureActions}>
        <input
          accept={ACCEPTED_TYPES}
          className={styles.hiddenInput}
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? [])
            if (file !== undefined) onSelect(file)
            /** Sem limpar, escolher o mesmo arquivo de novo não dispara `change` nenhum. */
            event.target.value = ''
          }}
          ref={inputRef}
          type="file"
        />
        <Button
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="upload" />
          {pictureUrl === null ? t('users.picture.add') : t('users.picture.replace')}
        </Button>
        {pictureUrl === null ? null : (
          <Button disabled={isPending} onClick={onRemove} size="sm" type="button" variant="ghost">
            <Icon name="trash" />
            {t('users.picture.remove')}
          </Button>
        )}
      </div>
    </div>
  )
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) return '—'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}
