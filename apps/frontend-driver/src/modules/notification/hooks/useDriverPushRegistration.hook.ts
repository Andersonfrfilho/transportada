/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'

import { enablePush } from '../shared/devicePush.service'
import {
  createBrowserPushEnvironment,
  isPushDisabledByDriver,
} from '../shared/devicePushEnvironment.service'

/**
 * Mantém o cadastro do aparelho em dia, **sem pedir permissão**: só renova para quem já ativou na tela de
 * Notificações (permissão concedida, aparelho cadastrado e não desligado por ele). Pedir permissão no login,
 * sem toque do motorista, era bloqueado pelo navegador e nunca cadastrava o aparelho; a ativação agora é um
 * botão (`DriverPushDeviceCard`).
 */
export function useDriverPushRegistration(canSync: boolean): void {
  const isSyncedRef = useRef(false)

  useEffect(() => {
    if (!canSync || isSyncedRef.current) return
    const environment = createBrowserPushEnvironment()
    if (!environment.isSupported()) return
    if (environment.permission() !== 'granted') return
    if (environment.readStoredDeviceId() === null || isPushDisabledByDriver()) return
    isSyncedRef.current = true
    void enablePush(environment)
  }, [canSync])
}
