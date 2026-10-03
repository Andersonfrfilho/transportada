/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { watchGeolocationPermission } from '../shared/geolocationPermission.service'

/** `true` só enquanto a permissão de localização do aparelho estiver negada; sem resposta, `false`. */
export function useGeolocationPermission(): boolean {
  const [isDenied, setIsDenied] = useState(false)

  useEffect(
    () =>
      watchGeolocationPermission({
        onChange: setIsDenied,
        permissions:
          typeof navigator !== 'undefined' && 'permissions' in navigator
            ? navigator.permissions
            : undefined,
      }),
    [],
  )

  return isDenied
}
