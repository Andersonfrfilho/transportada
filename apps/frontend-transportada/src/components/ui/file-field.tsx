/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type ChangeEvent, type RefObject } from 'react'

import { cn } from '@/lib/utils'

import { Icon } from './icon'
import styles from './file-field.module.css'

export type FileFieldProps = Readonly<{
  accept?: string
  actionLabel: string
  /** `environment` abre a câmera traseira no celular — é o anexo que o motorista tira na entrega. */
  capture?: 'environment' | 'user'
  className?: string | undefined
  disabled?: boolean
  fileName?: string
  inputRef?: RefObject<HTMLInputElement | null>
  label: string
  multiple?: boolean
  onSelect: (file: File | undefined) => void
  onSelectMany?: (files: readonly File[]) => void
  optional?: boolean
  optionalMark?: string
  placeholder: string
  /**
   * Limpa o valor depois de escolher. Sem isso, escolher **o mesmo arquivo de novo** não dispara
   * `change` nenhum, e a segunda tentativa do operador não acontece — nada na tela explica por quê.
   */
  resetAfterSelect?: boolean
}>

/**
 * O campo de arquivo do design system. O `<input type="file">` cru desenha o botão do **navegador**:
 * altura, fonte e cor vêm do sistema operacional, não dos tokens, e o resultado destoa de toda
 * fileira de campos ao lado dele. Aqui o nativo continua existindo — é ele que abre o seletor e que
 * o leitor de tela anuncia —, e o que se vê é a caixa do projeto.
 */
export function FileField({
  accept,
  actionLabel,
  capture,
  className,
  disabled = false,
  fileName,
  inputRef,
  label,
  multiple = false,
  onSelect,
  onSelectMany,
  optional = false,
  optionalMark,
  placeholder,
  resetAfterSelect = false,
}: FileFieldProps) {
  const inputId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? [])
    if (onSelectMany === undefined) onSelect(files[0])
    else onSelectMany(files)
    if (resetAfterSelect) event.target.value = ''
  }

  return (
    <div className={cn(styles.field, className)}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {optional && optionalMark !== undefined ? (
          <em className={styles.optional}>{optionalMark}</em>
        ) : null}
      </label>
      {/*
        O nome acessível vem do `aria-label`, não das duas `<label>`: o navegador concatenaria o
        texto das duas e o leitor de tela anunciaria "Preencher pelo documento Escolher arquivo
        Nenhum arquivo escolhido". A segunda existe só para o clique alcançar o input escondido.
      */}
      <input
        aria-label={label}
        className={styles.input}
        disabled={disabled}
        id={inputId}
        multiple={multiple}
        type="file"
        onChange={handleChange}
        {...(accept === undefined ? {} : { accept })}
        {...(capture === undefined ? {} : { capture })}
        {...(inputRef === undefined ? {} : { ref: inputRef })}
      />
      <label className={styles.control} htmlFor={inputId}>
        <span className={styles.action}>
          <Icon aria-hidden="true" name="upload" size="sm" />
          {actionLabel}
        </span>
        <span
          className={cn(styles.fileName, fileName === undefined ? '' : styles.fileNameSelected)}
        >
          {fileName ?? placeholder}
        </span>
      </label>
    </div>
  )
}
