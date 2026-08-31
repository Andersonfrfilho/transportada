/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

export class UserPictureNotFoundError extends ApiError {
  public constructor() {
    super(HTTP_ERROR.notFound)
  }
}

/**
 * Os dois erros de foto reusavam `invalidRequest`, e com ele o mesmo `INVALID_REQUEST` de qualquer
 * corpo malformado. A tela não tinha como dizer se o arquivo era grande demais ou de formato que a
 * rota não abre — e as duas coisas se consertam de maneiras diferentes: uma se comprime, a outra se
 * converte. Código estável por causa é o que o `apis.md` pede, e é o que torna a mensagem acionável.
 */
export class UserPictureTooLargeError extends ApiError {
  public constructor() {
    super({
      code: 'USER_PICTURE_TOO_LARGE',
      message: 'User picture exceeds the maximum size.',
      status: 400,
    })
    this.name = 'UserPictureTooLargeError'
  }
}

export class UserPictureUnsupportedFormatError extends ApiError {
  public constructor() {
    super({
      code: 'USER_PICTURE_UNSUPPORTED_FORMAT',
      message: 'User picture format is not supported.',
      status: 400,
    })
    this.name = 'UserPictureUnsupportedFormatError'
  }
}
