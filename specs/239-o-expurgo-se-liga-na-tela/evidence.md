# Evidências — 239

> Vazio até a primeira task. Cada task registra aqui o comando, o resultado (contagem de pass/fail), a
> mutação que provou o teste e o SHA do commit isolado.

## T1.1 — Política da carência e limites do prazo

**Arquivos:** `apps/api-transportada/src/companies/domain/location-retention.policy.ts` (função pura
`resolvePurgeEffectiveAt`, `isValidRetentionDays`; relógio por parâmetro `now`),
`apps/api-transportada/test/companies/location-retention-policy.contract.ts` (importado por
`test/companies.contract.test.ts`, que já está na lista do `package.json`).

**Regra implementada (`resolvePurgeEffectiveAt({ previous, next, now })`):**

| Caso                                                | `purge_effective_at`                               |
| --------------------------------------------------- | -------------------------------------------------- |
| `next.purgeEnabled = false` (qualquer anterior)     | `now` (sem carência; desligado não lê o campo)     |
| ligar sem linha ou de desligado                     | `now + 24 h`                                       |
| ligado e `next.retentionDays < previous` (encurtar) | `now + 24 h` (reabre, mesmo com carência em curso) |
| ligado e prazo maior ou igual (alongar / igual)     | mantém `previous.purgeEffectiveAt`                 |

Desvio consciente da letra do D5 ("alongar grava sem carência"): gravar `now` ao alongar durante uma
carência em curso (ligar e alongar em seguida) anularia os 24 h do ligar. Manter o valor anterior é
idêntico ao `now` quando a carência já passou (o worker compara `<= now`) e preserva a que ainda corre.
**Decisão a confirmar com o usuário.** Limites: `isValidRetentionDays` aceita só número inteiro 30..90.

**Execução:** `bun --env-file=../../.env.test test ./test/companies.contract.test.ts --test-name-pattern retention`
-> 33 pass / 0 fail (14 linhas da tabela de carência + 16 de limites + 3 de guarda: tabela não vazia x2 e
relógio). 33 = 1+14+1+1+16: todas as linhas rodam.

**Mutações** (edita, roda, reprova, restaura regravando):

| Mutação                                        | Resultado                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| M1 desligar abre carência                      | 4 fail                                                                                |
| M2 ligar sem linha sem carência                | 2 fail                                                                                |
| M3 ligar de desligado sem carência             | 2 fail                                                                                |
| M4 encurtar sem carência                       | 3 fail                                                                                |
| M5 igual abre carência (`<=`)                  | 2 fail                                                                                |
| M6 alongar abre carência (`!==`)               | 2 fail                                                                                |
| M7 alongar devolve `now`                       | 4 fail                                                                                |
| M8 carência de 23 h                            | 7 fail                                                                                |
| M9 piso 29 / M10 teto 91                       | 1 fail cada                                                                           |
| M11 piso exclusivo / M12 teto exclusivo        | 1 fail cada                                                                           |
| M13 aceita decimal (remove `Number.isInteger`) | 2 fail                                                                                |
| M14 aceita `string` no `typeof`                | 0 fail (equivalente: `Number.isInteger('60')` já recusa; M13+M14 juntas não testadas) |

**Gates (apps/api-transportada):** `bun run typecheck` sem saída de erro; `bun run lint` sem saída de
erro; `bun --env-file=../../.env.test test --timeout 120000` -> 9213 pass / 24 skip / 0 fail, 195 arquivos.
