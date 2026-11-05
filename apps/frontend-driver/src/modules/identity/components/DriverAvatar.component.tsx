/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

type DriverAvatarProps = Readonly<{
  className: string
  imageClassName: string
  initials: string
  pictureUrl: string | undefined
}>

/** Foto quando existe e carrega; senão as iniciais — imagem quebrada nunca deixa o círculo vazio. */
export function DriverAvatar({
  className,
  imageClassName,
  initials,
  pictureUrl,
}: DriverAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  const shouldShowPicture = pictureUrl !== undefined && failedUrl !== pictureUrl

  return (
    <span aria-hidden="true" className={className}>
      {shouldShowPicture ? (
        <img
          alt=""
          className={imageClassName}
          src={pictureUrl}
          onError={() => setFailedUrl(pictureUrl)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
