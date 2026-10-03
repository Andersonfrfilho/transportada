/* Copyright (c) 2026 Ada Technology. MIT License. */
type DrivingCandidate = Readonly<{ canDrive: boolean; status: string }>

/**
 * Spec 234 D5: quem pode ser oferecido como condutor — ativo e que dirige. O ajudante puro
 * (`canDrive` falso) fica de fora, e a API recusa o mesmo (`TRIP_DRIVER_CANNOT_DRIVE`).
 */
export function listActiveDrivingDrivers<TDriver extends DrivingCandidate>(
  drivers: readonly TDriver[],
): readonly TDriver[] {
  return drivers.filter((driver) => driver.status === 'active' && driver.canDrive)
}
