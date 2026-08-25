# 053 — A landing genérica e o pré-cadastro do agregado · evidências

Uma entrada por task concluída: comando executado, saída relevante e o que ela prova.

| Task | Comando | Resultado |
| ---- | ------- | --------- |
| T002 | `bun run --cwd apps/api-transportada test` | 3048 pass, 0 fail (`landing_settings` schema + migration estática) |
| T002 | `bun run --cwd apps/api-transportada db:check` | `Everything's fine 🐶🔥` |
| T003 | `bun run --cwd apps/api-transportada test` | 3053 pass, 0 fail (`resolveCompanyGroupRoot` + ordenação matriz-primeiro) |
