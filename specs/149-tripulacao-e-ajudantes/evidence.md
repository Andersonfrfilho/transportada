# Spec 149 — Evidências

## Diagnóstico (14/09/2026)

- Staging: proposta com 7 motoristas e 6 veículos, 5 viagens "Sem motorista".
- Causa: `useTripRouteAssembly.hook.ts:223-230` usa `resolveSoleDriverOfVehicle` (vínculo único do
  cadastro); a escolha manual por veículo não é enviada; `trip-composer.adapter.ts:64-80` cria 0 ou 1
  motorista por viagem.

## Tarefas

(uma seção por task: comando, saída resumida, commit)
