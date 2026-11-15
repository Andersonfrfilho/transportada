/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  PUSH_DEVICE_ID_STORAGE_KEY,
  PUSH_DISABLED_STORAGE_KEY,
  type PushEnvironment,
} from './devicePush.service'
import { getNotificationClient } from './notificationClient.service'

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Armazenamento bloqueado: o aparelho segue cadastrado, só não lembramos o id para desativar.
  }
}

export function isPushDisabledByDriver(): boolean {
  return readStorage(PUSH_DISABLED_STORAGE_KEY) === '1'
}

export function setPushDisabledByDriver(disabled: boolean): void {
  writeStorage(PUSH_DISABLED_STORAGE_KEY, disabled ? '1' : null)
}

/** O ambiente real: navegador, service worker e o cliente de notificação da casca. */
export function createBrowserPushEnvironment(): PushEnvironment {
  const registration = () => navigator.serviceWorker.ready
  return {
    getSubscription: async () => (await registration()).pushManager.getSubscription(),
    getVapidPublicKey: () => getNotificationClient().getVapidPublicKey(),
    isSupported: () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    permission: () => Notification.permission,
    readStoredDeviceId: () => readStorage(PUSH_DEVICE_ID_STORAGE_KEY),
    registerWebPush: (subscription) => getNotificationClient().registerWebPush(subscription),
    requestPermission: () => Notification.requestPermission(),
    storeDeviceId: (id) => writeStorage(PUSH_DEVICE_ID_STORAGE_KEY, id),
    subscribe: async (applicationServerKey) =>
      (await registration()).pushManager.subscribe({
        applicationServerKey: applicationServerKey as unknown as BufferSource,
        userVisibleOnly: true,
      }),
    unregisterDevice: (id) => getNotificationClient().unregisterDevice(id),
  }
}
