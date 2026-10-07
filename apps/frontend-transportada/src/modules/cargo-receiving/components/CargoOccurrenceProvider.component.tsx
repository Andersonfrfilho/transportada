/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX, ReactNode } from 'react'

import { CargoOccurrenceContext } from '../hooks/useCargoOccurrence.hook'
import {
  useCargoOccurrenceController,
  type CargoOccurrenceControllerInput,
} from '../hooks/useCargoOccurrenceController.hook'
import { CargoOccurrenceDialog } from './CargoOccurrenceDialog.component'

type CargoOccurrenceProviderProps = CargoOccurrenceControllerInput &
  Readonly<{ children: ReactNode }>

/** A avaria e a devolução da chegada, ao alcance de cada nota; o formulário aberto mora aqui, uma vez só. */
export function CargoOccurrenceProvider({
  children,
  ...input
}: CargoOccurrenceProviderProps): JSX.Element {
  const controller = useCargoOccurrenceController(input)

  return (
    <CargoOccurrenceContext value={controller}>
      {children}
      {controller.form === undefined ? null : (
        <CargoOccurrenceDialog
          arrivalId={input.arrival.id}
          note={controller.form}
          onClose={controller.closeForm}
        />
      )}
    </CargoOccurrenceContext>
  )
}
