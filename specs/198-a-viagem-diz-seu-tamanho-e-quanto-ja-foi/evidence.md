# Evidence — Feature 198

Uma seção por task, na ordem do `tasks.md`. Cada seção traz:

- o comando;
- a contagem de testes;
- o trecho relevante da saída;
- o commit.

Quando a task toca `test/integration/**`, uma query ou um repositório, a seção traz também o segundo
comando da API (`bun --env-file=../../.env.test run test:integration`).

## Pendências registradas na escrita da spec (2026-09-25)

- **Base.** `work/driver-app` não estava em `origin/staging`
  (`git merge-base --is-ancestor HEAD origin/staging` falhou, 27 commits à frente). A T0.1 confere de
  novo.
- **Fix da coordenada.**
  `git log origin/staging --oneline -S geocodedAddresses -- apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`
  não devolveu nada: a correção de outra sessão ainda não tinha chegado.
- **RF9 (convivência com a 192).** Fica pendente até uma das duas specs chegar a `origin/staging`
  com a outra já lá. Implementa quem chegar por último. A 198 não edita arquivos da 192.
