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

export class UserPictureTooLargeError extends ApiError {
  public constructor() {
    super(HTTP_ERROR.invalidRequest)
  }
}

export class UserPictureUnsupportedFormatError extends ApiError {
  public constructor() {
    super(HTTP_ERROR.invalidRequest)
  }
}
