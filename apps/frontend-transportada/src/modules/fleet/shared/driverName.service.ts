/* Copyright (c) 2026 Ada Technology. MIT License. */
const WHITESPACE_PATTERN = /\s+/

export type DriverNameParts = Readonly<{ givenName: string; surname: string }>

/**
 * O primeiro espaço separa, e o resto todo é sobrenome: partir assim e juntar com um espaço é
 * reversível, então o nome gravado em `fleet_drivers.name` atravessa a edição sem degradar.
 */
export function splitDriverName(value: string): DriverNameParts {
  const [givenName = '', ...rest] = value.trim().split(WHITESPACE_PATTERN)
  return { givenName, surname: rest.join(' ') }
}

export function joinDriverName(parts: DriverNameParts): string {
  return [parts.givenName, parts.surname].filter((part) => part !== '').join(' ')
}
