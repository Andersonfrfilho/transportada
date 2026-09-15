/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { UserPictureExistencePort } from '../../src/identity/application/user-picture.port'

export function stubUserPictureExistence(hasPicture = false): UserPictureExistencePort {
  return {
    async hasPicture() {
      return hasPicture
    },
  }
}
