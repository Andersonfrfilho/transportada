/* Copyright (c) 2026 Ada Technology. MIT License. */
export const OWN_PICTURE_PATH = '/me/picture'
const OWN_PICTURE_FORM_FIELD = 'file'
const PICTURE_ORIGIN_HEADER = 'x-picture-origin'
const PICTURE_ORIGINS = ['cnh', 'self', 'admin'] as const
export const OWN_PICTURE_REQUEST_FAILED = 'OWN_PICTURE_REQUEST_FAILED'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type OwnPictureOrigin = (typeof PICTURE_ORIGINS)[number]

export type OwnPicture = Readonly<{
  blob: Blob
  /** `undefined` quando a API não informa (ou informa valor que este app não conhece): sem nota. */
  origin: OwnPictureOrigin | undefined
}>

function parsePictureOrigin(value: string | null): OwnPictureOrigin | undefined {
  return PICTURE_ORIGINS.find((origin) => origin === value)
}

export type OwnPictureClient = Readonly<{
  /** `undefined` quando a pessoa não tem foto: o app fica nas iniciais. */
  read: () => Promise<OwnPicture | undefined>
  remove: () => Promise<void>
  replace: (picture: Blob) => Promise<void>
}>

async function readErrorCode(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    const error =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as { readonly error: unknown }).error
        : undefined
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { readonly code: unknown }).code
        : undefined
    return typeof code === 'string' ? code : OWN_PICTURE_REQUEST_FAILED
  } catch {
    return OWN_PICTURE_REQUEST_FAILED
  }
}

/** A rota não recebe id: a API sabe quem é pelo token. */
export function createOwnPictureClient(dependencies: ClientDependencies): OwnPictureClient {
  async function send(init: {
    readonly body?: FormData
    readonly method: string
  }): Promise<Response> {
    const accessToken = await dependencies.getAccessToken()
    return dependencies.fetch(
      new Request(`${dependencies.apiUrl}${OWN_PICTURE_PATH}`, {
        ...init,
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    )
  }

  async function assertOk(response: Response): Promise<void> {
    if (!response.ok) throw new Error(await readErrorCode(response))
  }

  return {
    async read() {
      const response = await send({ method: 'GET' })
      if (response.status === 404) return undefined
      await assertOk(response)
      return {
        blob: await response.blob(),
        origin: parsePictureOrigin(response.headers.get(PICTURE_ORIGIN_HEADER)),
      }
    },
    async remove() {
      await assertOk(await send({ method: 'DELETE' }))
    },
    async replace(picture) {
      const form = new FormData()
      form.set(OWN_PICTURE_FORM_FIELD, picture, 'profile-picture')
      await assertOk(await send({ body: form, method: 'PUT' }))
    },
  }
}
