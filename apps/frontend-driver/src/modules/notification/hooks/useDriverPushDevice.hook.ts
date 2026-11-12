/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  disablePush,
  enablePush,
  readPushState,
  type PushActionResult,
  type PushDeviceState,
  type PushFailureReason,
} from '../shared/devicePush.service'
import {
  createBrowserPushEnvironment,
  setPushDisabledByDriver,
} from '../shared/devicePushEnvironment.service'

export type DriverPushDevice = {
  readonly disable: () => Promise<void>
  readonly enable: () => Promise<void>
  readonly failure: PushFailureReason | null
  readonly isWorking: boolean
  /** `null` enquanto o estado do aparelho ainda está sendo lido. */
  readonly state: PushDeviceState | null
}

export function useDriverPushDevice(): DriverPushDevice {
  const environment = useMemo(() => createBrowserPushEnvironment(), [])
  const [state, setState] = useState<PushDeviceState | null>(null)
  const [failure, setFailure] = useState<PushFailureReason | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  useEffect(() => {
    let isMounted = true
    readPushState(environment)
      .then((next) => {
        if (isMounted) setState(next)
      })
      .catch(() => {
        if (isMounted) setState('off')
      })
    return () => {
      isMounted = false
    }
  }, [environment])

  const run = useCallback(
    async (action: () => Promise<PushActionResult>, isEnabling: boolean) => {
      setIsWorking(true)
      setFailure(null)
      const result = await action()
      if (result.ok) {
        setPushDisabledByDriver(!isEnabling)
        setState(result.state)
      } else {
        setFailure(result.reason)
        if (!isEnabling) setState(await readPushState(environment).catch(() => 'off' as const))
        if (isEnabling && result.reason === 'denied') setState('denied')
      }
      setIsWorking(false)
    },
    [environment],
  )

  return {
    disable: () => run(() => disablePush(environment), false),
    enable: () => run(() => enablePush(environment), true),
    failure,
    isWorking,
    state,
  }
}
