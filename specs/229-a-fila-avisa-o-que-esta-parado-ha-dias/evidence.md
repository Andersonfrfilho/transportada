# Evidence — spec 229

Base: `origin/staging` em `7133d9c30` (spec 227 publicada). Branch `work/spec-229-aviso-parado`.

## Vermelho antes (T1.1)

`stale-pending.contract.ts`: o módulo `stalePending.service` não existia.

## Prova por mutação (T1.3)

| #   | Mutação                                   | Resultado                                                                                                                                           |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | o limite vira `<` (24 h exatas avisam)    | 1 falha (contrato)                                                                                                                                  |
| 2   | recusado e não verificado passam a contar | 1 falha (contrato)                                                                                                                                  |
| 3   | a data nunca aparece na fila              | 1 falha (contrato)                                                                                                                                  |
| 4   | limite de 12 h                            | 2 falhas (contrato)                                                                                                                                 |
| 5   | a viagem nunca mostra a faixa             | **sobreviveu ao contrato** (ele só procurava o texto `<DriverStalePendingNotice`, que continuava no ramo morto) → morta pelo smoke de comportamento |

A 5 mostrou que o teste de código era de parede. Entrou o smoke "o que está parado há mais de um dia
ganha a faixa de aviso; o recente, não" (`driver-app.smoke.spec.ts`), que envelhece um item no
IndexedDB do próprio app, recarrega e confere a faixa e o caminho até a tela de pendências.

## Gates (T1.2)

`format:check` limpo; typecheck e lint em exit 0; app do motorista 1031 pass / 0 fail; painel 6261 pass / 0 fail e hooks 248 / 0; smoke completo 26 passed.

## Revisão de design (T1.4)

`test/spec-229-prints.smoke.spec.ts`: `prints/faixa-parado-ha-dias-375-*.png` e
`prints/fila-com-data-375-*.png`. A faixa e o banner "N aguardando envio" aparecem juntos e levam ao
mesmo lugar (redundância deliberada, registrada no plan). A data segue o idioma do navegador: "09/30"
no navegador de teste (en-US), "30/09" num celular em pt-BR.

## Pendente

- Nada. **T1.5** feita: publicada depois da aprovação do usuário nos prints.
