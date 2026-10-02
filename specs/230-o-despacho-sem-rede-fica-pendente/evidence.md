# Evidence — spec 230

Base: `origin/staging` em `012f6c8a4` (spec 229 publicada). Branch `work/spec-230-despacho-offline`.

## Verificação no servidor (antes de decidir)

- `dispatch-driver-trip.use-case.ts`: "mesma idempotência (`unchanged` na repetição)" — reenviar é
  seguro, então a chave de idempotência não vai no cabeçalho (a rota não a lê).
- A rota `POST /me/trips/current/dispatch` não muda.

## Vermelho antes (T1.1)

`dispatch-queue.contract.ts` antes do código: caminho, corpo, resultados, ordem, visão e ligação da tela
falhavam (o tipo `dispatch` não existia).

## Prova por mutação (T1.4)

| #   | Mutação                                          | Resultado                                                                                     |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1   | o caminho do despacho aponta para `/start-route` | 3 falhas (contrato)                                                                           |
| 2   | a visão da fila perde a viagem do despacho       | 1 falha (contrato)                                                                            |
| 3   | despacho na fila deixa de destravar o campo      | 1 falha (smoke)                                                                               |
| 4   | despacho recusado deixa de avisar                | **sobreviveu** → entrou o smoke "despacho recusado avisa e devolve o botão" → morta (1 falha) |

## Gates

Sobre `origin/staging` em `012f6c8a4`: `format:check` limpo; typecheck e lint em exit 0 nas duas apps;
app do motorista 1038 pass / 0 fail; painel 6261 pass / 0 fail e `test:hooks` 248 / 0; smoke completo do
app do motorista 29 passed.

## Revisão de design (T1.5)

`test/spec-230-prints.smoke.spec.ts`: `prints/antes-do-despacho-375-*.png`,
`prints/despacho-pendente-375-*.png` (aviso + ações de campo liberadas) e
`prints/fila-com-despacho-375-*.png` (item "Iniciar viagem" com "Enviar agora").
