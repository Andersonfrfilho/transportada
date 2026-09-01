/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBackgroundRemoval } from '@adatechnology/image-cutout'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import {
  BACKGROUND_REMOVAL_CONFIG,
  PICTURE_BACKGROUND_CHOICE,
  toBackgroundFill,
  type PictureBackgroundChoice,
} from '../shared/backgroundRemoval.constant'
import styles from '../styles/userAdministration.module.css'

type CompanyUserPictureFieldProps = Readonly<{
  errorCode?: string | undefined
  isLoading: boolean
  isPending: boolean
  name: string
  onRemove: () => void
  onSelect: (file: File) => void
  pictureUrl: string | null
}>

const BACKGROUND_CHOICES = [
  PICTURE_BACKGROUND_CHOICE.WHITE,
  PICTURE_BACKGROUND_CHOICE.COMPANY,
  PICTURE_BACKGROUND_CHOICE.TRANSPARENT,
] as const

/** Aceito no envio; o servidor confere a assinatura do arquivo e não confia neste atributo. */
const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp'

/**
 * O avatar da pessoa, na ficha dela. Ele é imagem de dado pessoal servida por rota autenticada: a
 * tela busca os bytes e desenha uma URL de objeto, porque `<img src>` não manda o token.
 */
export function CompanyUserPictureField({
  errorCode,
  isLoading,
  isPending,
  name,
  onRemove,
  onSelect,
  pictureUrl,
}: CompanyUserPictureFieldProps) {
  const { t } = useTranslation('identity')
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * O arquivo escolhido fica retido até alguém decidir: o modelo às vezes come a orelha, e o
   * recorte nunca é aplicado sozinho — o resultado aparece ao lado do original para ser aprovado.
   */
  const [chosenFile, setChosenFile] = useState<File | null>(null)
  const [background, setBackground] = useState<PictureBackgroundChoice>(
    PICTURE_BACKGROUND_CHOICE.WHITE,
  )
  const cutout = useBackgroundRemoval({ config: BACKGROUND_REMOVAL_CONFIG, file: chosenFile })
  const chosenUrl = useObjectUrl(chosenFile)

  function submit(file: File): void {
    onSelect(file)
    setChosenFile(null)
    cutout.discard()
  }

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

      {errorCode === undefined ? null : (
        /* O envio falhava calado: o arquivo sumia da revisão e a foto antiga continuava ali. */
        <p className={styles.feedback} role="alert">
          {t(`users.errors.${errorCode}`, { defaultValue: t('users.errors.default') })}
        </p>
      )}

      <div className={styles.pictureActions}>
        <input
          accept={ACCEPTED_TYPES}
          className={styles.hiddenInput}
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? [])
            if (file !== undefined) setChosenFile(file)
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

      {chosenFile === null ? null : (
        <div className={styles.pictureReview}>
          <p className={styles.hint}>{t('users.picture.review')}</p>

          <div className={styles.pictureActions}>
            {BACKGROUND_CHOICES.map((choice) => (
              <Button
                disabled={cutout.running || !cutout.available}
                key={choice}
                onClick={() => {
                  setBackground(choice)
                  void cutout.run(toBackgroundFill(choice))
                }}
                size="sm"
                type="button"
                variant={choice === background ? 'default' : 'ghost'}
              >
                <Icon name="image" />
                {t(`users.picture.background.${choice}`)}
              </Button>
            ))}
          </div>

          {/* O recorte só se aprova vendo: sem o resultado ao lado, o botão é fé. */}
          {/**
           * O original aparece **sempre**, e não só quando o recorte roda. Antes, quem escolhia um
           * arquivo e não pedia remoção de fundo — ou estava num navegador onde ela não roda — via
           * um painel de revisão sem imagem alguma: "confira o resultado" sem nada para conferir.
           */}
          <div className={styles.pictureComparison}>
            {chosenUrl === null ? null : (
              <img
                alt={t('users.picture.chosenAlt', { name })}
                className={styles.picture}
                src={chosenUrl}
              />
            )}
            {cutout.previewUrl === null ? null : (
              <img
                alt={t('users.picture.cutoutAlt', { name })}
                className={styles.picture}
                src={cutout.previewUrl}
              />
            )}
            {cutout.running ? (
              <span className={styles.hint}>{t('users.picture.running')}</span>
            ) : null}
          </div>

          {cutout.error === null ? null : (
            <p className={styles.feedback} role="alert">
              {t('users.picture.cutoutFailed')}
            </p>
          )}

          <div className={styles.pictureActions}>
            <Button
              disabled={isPending || cutout.running}
              onClick={() => submit(cutout.result ?? chosenFile)}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {cutout.result === null
                ? t('users.picture.useOriginal')
                : t('users.picture.useCutout')}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                setChosenFile(null)
                cutout.discard()
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
              {t('users.picture.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Mesma disciplina da foto que desce do servidor: toda URL de objeto criada é revogada. Sem isso,
 * cada arquivo experimentado antes de enviar deixaria um blob preso na aba pelo resto da sessão.
 */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (file === null) {
      setUrl(null)
      return
    }

    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [file])

  return url
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) return '—'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}
