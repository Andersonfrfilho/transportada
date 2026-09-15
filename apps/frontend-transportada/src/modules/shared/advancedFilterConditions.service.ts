/* Copyright (c) 2026 Ada Technology. MIT License. */

type ConditionGroupShape = Readonly<{
  conditions: readonly Readonly<{ id: string }>[]
  id: string
}>

type AdvancedFilterShape = Readonly<{ groups: readonly ConditionGroupShape[] }>

export type RemoveAdvancedFilterConditionParams<TModel extends AdvancedFilterShape> = Readonly<{
  conditionId: string
  groupId: string
  model: TModel
}>

/** Grupo sem condição é neutro nos avaliadores: tirar a última volta a lista ao resultado sem filtro. */
export function removeAdvancedFilterCondition<TModel extends AdvancedFilterShape>({
  conditionId,
  groupId,
  model,
}: RemoveAdvancedFilterConditionParams<TModel>): TModel {
  return {
    ...model,
    groups: model.groups.map((group) =>
      group.id === groupId
        ? {
            ...group,
            conditions: group.conditions.filter((condition) => condition.id !== conditionId),
          }
        : group,
    ),
  }
}

/** Sobra um grupo vazio para o "Adicionar condição" continuar à mão. */
export function clearAdvancedFilterConditions<TModel extends AdvancedFilterShape>(
  model: TModel,
): TModel {
  return {
    ...model,
    groups: model.groups.slice(0, 1).map((group) => ({ ...group, conditions: [] })),
  }
}

export function countAdvancedFilterConditions(model: AdvancedFilterShape): number {
  return model.groups.reduce((total, group) => total + group.conditions.length, 0)
}
