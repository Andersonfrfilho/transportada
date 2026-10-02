# Evidências — 227 A nota se abre inteira

Spec escrita em 2026-10-02 a partir do mapa da exploração. Aguarda N2 e N5 (só bloqueiam a Fase 5).

## T0.1 — renumeração 225 → 226

`origin/staging` já tinha `225-a-viagem-terminada-nao-foi-movida`; os números 226 a 229 estavam livres em
**todas** as refs. Feita **antes** do rebase, o único momento em que toda referência a 225 é minha.
37 arquivos, 85 substituições por lista explícita de padrões e 21 renomes via `git mv`; **zero resíduo**
conferido por `grep`. Ficaram de fora de propósito os falsos positivos — `'225.0000'`, o código `'225'`
da SEFAZ, os builds em `dist/`. Os commits antigos continuam dizendo 225: história não se reescreve.

## T0.2 — rebase em `origin/staging`

93 commits atrás, 32 à frente. Backup guardado em `backup/pre-rebase-226`. **Seis conflitos**, todos
resolvidos sem perder o trabalho de ninguém:

| arquivo                               | natureza                                          | resolução                                                |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `static-migration.contract.ts`        | lista exaustiva de migrations                     | as duas entradas, em ordem                               |
| `trip-http.fixture.ts` (2×)           | dois campos opcionais acrescentados ao mesmo tipo | os dois                                                  |
| `package.json` da API                 | a lista explícita de `test:integration`           | a lista de staging **mais** o meu arquivo (148 no total) |
| `trip.contract.test.ts` (painel)      | imports de teste dos dois lados                   | todos                                                    |
| `tripValuationResponse.validation.ts` | **fusão de duas intenções**, ver abaixo           | staging + a minha validação dentro de `toRevenueLine`    |

Um commit (`0659a481b`, o SQLSTATE do `RESTRICT`) foi **pulado sozinho pelo git — já estava em staging**,
a mesma correção feita por outra sessão.

### O único conflito que não era mecânico

A tarefa "endurecer a leitura de dinheiro", que o usuário começou em outra sessão a partir de uma
observação minha, **já estava em staging** e tinha reestruturado `toTripValuation` (`collectLines` +
`toRevenueLine` recusando `amount` malformado). A minha T3.1 acrescentava a validação dos oito campos no
formato antigo. Escolher um lado perderia a outra intenção; a fusão põe a minha validação **dentro** de
`toRevenueLine`, com a mesma semântica das duas: linha malformada → `null` → avaliação recusada. Um
commit seguinte só editava o comentário de uma função (`readRevenueLines`) que deixou de existir, e o texto
corrigido já vive em `toRevenueLine` — descartei o órfão.

### Rebase limpo não é typecheck verde

`bun install --frozen-lockfile` e `typecheck` nas **sete** apps: exit 0. Os testes pegaram o que o typecheck
não podia: **5 contratos de cadeia de snapshots** reprovaram — T0.3.

## T0.3 — a migration reencadeada

Ver a entrada final de `specs/196-…/evidence.md`. Procedimento: guardar o `migration.sql` e o `rollback.sql`,
remover a pasta, deixar o `drizzle-kit` gerar a partir do snapshot de staging (`prevIds` = id dela, conferido
por script), trocar o SQL gerado pelo escrito à mão, renomear no `DELETE` do journal do rollback, atualizar
a lista exaustiva.

| portão                  | resultado                                            |
| ----------------------- | ---------------------------------------------------- |
| `db:generate`           | `no_changes`                                         |
| contratos de migration  | **75 pass · 4 skip · 0 fail**                        |
| `make migration-test`   | **115 pass · 0 fail**                                |
| contrato inteiro da API | **8656 testes · 0 fail**                             |
| painel                  | **6301 pass · 0 fail** e hooks **248 pass · 0 fail** |

O teste `beacon` do painel estourou o teto de 5 s no primeiro run (carga) e passou 3 de 3 isolado e na
suíte inteira; nada em `driver-trip` foi tocado por mim.
