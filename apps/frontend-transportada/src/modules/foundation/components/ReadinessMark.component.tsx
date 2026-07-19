/* Copyright (c) 2026 Ada Technology. MIT License. */
type ReadinessMarkProps = {
  readonly label: string
}

export function ReadinessMark({ label }: ReadinessMarkProps) {
  return (
    <span className="readiness-mark" aria-label={label}>
      <span aria-hidden="true" />
    </span>
  )
}
