/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'

import { captureRegistry, type CaptureKind } from '../shared/captureRegistry.service'

/** Conta a captura aberta enquanto `isActive` for verdadeiro — e fecha ao desmontar. */
export function useCaptureRegistration(kind: CaptureKind, isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return undefined
    captureRegistry.open(kind)
    return () => captureRegistry.close(kind)
  }, [isActive, kind])
}
