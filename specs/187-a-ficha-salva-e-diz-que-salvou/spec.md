# 187 — A ficha salva e diz que salvou

## Problema

Medido em staging em 25/09/2026, cadastrando um motorista com 29 rotas inteiras:
`POST /fleet/drivers` 201, `PUT …/vehicles` 200, `PUT …/regions` 200 — e a ficha mostrou "Não foi
possível salvar o cadastro", continuou preenchida e o motorista apareceu na lista.

**Causa:** a API devolve a cobertura de zona inteira com `city: ""` e `state: ""` (coluna
`not null default ''`, contrato `fleet-driver-regions-http/coverage.contract.ts`), e o validador da
tela exigia `null` desde a T011 (`a11869471`, 20/08/2026). A resposta era recusada, o `submit` caía no
`catch` e o aviso genérico tomava o lugar do "salvo". O mesmo validador lê a cobertura ao abrir a
edição, então toda ficha com zona inteira abria sem ela.

A primeira tentativa do mesmo cadastro deu **400** e ninguém soube por qual campo: o corpo da
resposta lista os campos (`details[].field`), mas o log da API guarda só o status.

## Resultado

1. O validador aceita `""` (e `null`) na zona inteira e o adaptador entrega `null` ao resto da tela;
   cobertura de cidade com cidade ou UF vazia continua recusada.
2. Todo `ApiError` com `details` grava `http_request_rejected` (nível `warn`) com o `correlationId` e
   os **nomes** dos campos — nunca a mensagem, que pode citar o que foi digitado.

## Critérios de aceite

- [x] `driverCoverageListFromApi` lê o corpo real da API (`test/fleet/driver-coverage.contract.ts`)
- [x] 400 com campos gera `http_request_rejected` sem valor digitado
      (`test/observability/rejected-fields-log.contract.ts`)
