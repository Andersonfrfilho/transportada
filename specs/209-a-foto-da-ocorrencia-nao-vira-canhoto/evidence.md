# Evidence — Spec 209 (a foto da ocorrência não vira canhoto)

Em 2026-09-25, na branch `work/driver-app`.

## Onde os gates rodaram

A árvore de trabalho tem hunks não commitados de outras sessões (spec 193, 205, 208, 210) nos mesmos
arquivos. Com eles, o typecheck da API já falha antes desta spec (`receivedBy` em
`DeliveryProofFieldSettings`).

Por isso os gates rodaram numa árvore limpa: `git worktree add --detach` no scratchpad, em
`82be915c9`, só com os arquivos desta spec aplicados por cima. A redução ao HEAD tem dois passos:

- nos dois arquivos com hunks alheios (`me-trip.routes.ts`, `me-trip.schema.ts`), só o patch desta
  spec foi aplicado;
- os demais arquivos foram copiados como estão.

## Contratos antes, vistos falhar

Os contratos foram aplicados sobre o HEAD antes do código:

| Suíte                                                                     | Vermelho                                                                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API, `test/trip-occurrence/stop-upload.contract.ts`, sem os módulos novos | `Cannot find module request-stop-occurrence-upload.use-case.js`                                                                                                            |
| API, só com os dois módulos novos                                         | **13 fail / 255 pass**. Anexo ignorado nos quatro 404, reenvio sem completar, schema recusando `attachmentObjectId`, rotas por parada ausentes e `main.ts` com `null` fixo |
| App do motorista, `test/driver-trip/stop-occurrence-photo.contract.ts`    | `Cannot find module stopOccurrencePhoto.service`                                                                                                                           |
| Legado, `test/driver-trip/stop-occurrence-photo.contract.ts`              | `Cannot find module stopOccurrencePhoto.service`                                                                                                                           |

## Gates, na árvore limpa, em primeiro plano

| Gate                                                                       | Resultado                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API contrato: `bun --env-file=../../.env.test test --timeout 120000`       | **7326 pass, 23 skip, 1 fail**, 184 arquivos. A falha é `test/trip-delivery-proof/received-by.contract.ts`, que o próprio HEAD traz vermelho: ele entrou em `4a54d08d8` como "contrato antes" da spec 193 T3.2, e `received-by.policy.js` ainda não existe no HEAD. Não é desta spec |
| API integração: `bun --env-file=../../.env.test run test:integration`      | **628 pass, 7 skip, 0 fail**, 635 testes em 116 arquivos, com `stop-occurrence-photo.integration.ts` (5 pass, 15 expects, contra Postgres)                                                                                                                                           |
| API typecheck: `tsc --noEmit`                                              | 7 erros, **todos** em `received-by.contract.ts` (o mesmo vermelho do HEAD). Zero fora dele                                                                                                                                                                                           |
| API lint: `bun run lint`                                                   | exit 0                                                                                                                                                                                                                                                                               |
| App do motorista: `bun run --cwd apps/frontend-driver check`               | exit 0. Lint e typecheck limpos, **631 pass / 0 fail** (3 arquivos), build com `dist.contract` 6 pass                                                                                                                                                                                |
| App do motorista: `bun run --cwd apps/frontend-driver smoke` (porta 53112) | exit 0. **2 passed** (service worker) e **23 passed**, entre eles o novo `Deu problema com foto: a foto é da ocorrência, e nunca vira canhoto`                                                                                                                                       |
| Painel (legado): `bun run test`                                            | **5353 pass / 0 fail** (29 arquivos) e **54 pass / 0 fail**                                                                                                                                                                                                                          |
| Painel: `typecheck` e `lint`                                               | exit 0 e exit 0                                                                                                                                                                                                                                                                      |
| Prettier nos arquivos da spec                                              | "All matched files use Prettier code style!"                                                                                                                                                                                                                                         |

Os servidores de preview 53200 e 53901 não foram tocados.

## O que o smoke novo prova

Numa tela de 375 px, o motorista escolhe "Doca interditada", tira a foto e registra. As chamadas são,
nesta ordem:

1. `POST /stops/:id/occurrences`, sem anexo;
2. `POST /stops/:id/occurrence-uploads`;
3. `PUT` no bucket, sem token;
4. `POST .../confirm`;
5. `POST /stops/:id/occurrences` com a **mesma** `Idempotency-Key` e `attachmentObjectId`.

Nenhuma chamada vai a `/documents/:id/proof`. Não há estouro horizontal nem alvo de toque menor que
44 px.

## Revisão de design (T6)

Print do formulário, em 375 px, com a foto anexada: `scratchpad/spec209-form-photo.png`. Foi gerado
por Playwright contra o bundle do smoke, sem tocar no preview do usuário.

- O bloco de foto é o mesmo do canhoto e do "Não entreguei": título, miniatura, "anexada",
  "Tirar foto"/"Refazer" e "Anexar". O `FileField` antigo, com contador de fotos, saiu.
- "Registrar" fica desabilitado enquanto a foto é reduzida.
- **Pendência de design, anterior a esta spec:** a `textarea` "O que aconteceu" do formulário da
  parada não ocupa a largura do cartão.
- **Pendência de conteúdo, anterior a esta spec:** a prévia do aviso cita a nota escolhida por
  `findOccurrencePhotoDocument`, mas a ocorrência de parada vai com `documentId: null`.

## Gates de novo, no HEAD final (`f3e292c91`)

Enquanto isto corria, outras sessões commitaram a spec 193 (T3.3/T3.4) e a 205. Os gates rodaram de
novo na árvore limpa, já sobre `f3e292c91` com esta spec por cima:

| Gate                                | Resultado                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API contrato                        | **7485 pass, 23 skip, 0 fail**, 184 arquivos. O vermelho da 193 foi implementado                                                                                                                                                                                                                                                                             |
| API integração (`test:integration`) | **638 pass, 7 skip, 1 fail**, 646 testes em 117 arquivos. A falha foi `invitation-status-join.integration.ts`, que estourou o prazo padrão de 5 s com a máquina carregada (o smoke e os testes do painel rodavam em paralelo). Rodado sozinho logo depois, junto com `stop-occurrence-photo.integration.ts`: **6 pass, 0 fail**. Não toca em nada desta spec |
| API typecheck e lint                | 0 erros, exit 0                                                                                                                                                                                                                                                                                                                                              |
| App do motorista `check`            | exit 0: **631 pass / 0 fail** e build com `dist.contract` 6 pass                                                                                                                                                                                                                                                                                             |
| App do motorista `smoke` (53112)    | exit 0: **2 passed** e **23 passed**                                                                                                                                                                                                                                                                                                                         |
| Painel `test`, `typecheck` e `lint` | **5361 pass / 0 fail** e **54 pass / 0 fail**; typecheck exit 0; lint exit 0                                                                                                                                                                                                                                                                                 |

## Por último, em `cd768ce86`

Entraram mais dois commits de outras sessões: a rota de quem recebeu, da 193, no `main.ts`, e os
ícones do `DriverStopCard`. Os dois arquivos foram remontados como o HEAD mais só os trechos desta
spec, e os gates rodaram de novo:

- API contrato: **7496 pass, 23 skip, 0 fail**; typecheck com 0 erros; lint com exit 0.
- App do motorista: `check` com **631 pass / 0 fail**, `smoke` com **2 + 23 passed**.
- Painel: **5361 + 54 pass**, com typecheck e lint limpos.

A integração não rodou de novo. Os dois commits não tocam em nada do que ela cobre.

## Consulta de diagnóstico — SOMENTE LEITURA

Não foi executada em ambiente nenhum. É para o usuário rodar, se quiser, contra o banco que escolher.
O banco de produção é o `Postgres-Hqfu`, e o serviço "Postgres" é outro.

A consulta acha **canhotos que talvez tenham vindo do "Deu problema"**: fotos de comprovante gravadas
pelo motorista perto de uma ocorrência de parada que ele mesmo registrou na mesma parada.

Como ler o resultado:

- **Não prova nada sozinha.** O motorista pode ter registrado a ocorrência e fotografado o canhoto de
  verdade logo depois.
- **Serve para conferir a imagem.** O `object_id` leva à foto.
- **O que entra e o que não entra.** O defeito só gravava comprovante em nota já entregue. A foto de
  nota não entregue era recusada pela API e nunca chegou ao banco: ela está, no máximo, na fila de um
  aparelho.
- **A janela.** O padrão é de 10 minutos, entre a hora da captura da foto e o registro da ocorrência.
  A drenagem sobe primeiro os eventos e depois os anexos, então os dois costumam cair na mesma
  drenagem.

```sql
-- Spec 209: canhotos que talvez tenham vindo do "Deu problema". SOMENTE LEITURA.
with parameters as (select interval '10 minutes' as proof_window)
select
  proof.company_id,
  proof.id                                  as proof_id,
  proof.object_id,
  proof.punctuality,
  coalesce(proof.captured_at, proof.created_at) as proof_taken_at,
  occurrence.id                             as stop_occurrence_id,
  occurrence.kind                           as occurrence_kind,
  occurrence.created_at                     as occurrence_recorded_at,
  event.stop_id,
  event.trip_document_id,
  abs(extract(epoch from (coalesce(proof.captured_at, proof.created_at) - occurrence.created_at)))::int
                                            as seconds_apart
from trip_delivery_proofs as proof
join trip_stop_events as event
  on event.company_id = proof.company_id
 and event.id = proof.stop_event_id
join trip_stop_occurrences as occurrence
  on occurrence.company_id = event.company_id
 and occurrence.stop_id = event.stop_id
 and occurrence.actor_user_id = proof.actor_user_id
cross join parameters
where proof.kind = 'photo'
  and proof.channel = 'driver_app'
  and occurrence.channel = 'driver_app'
  and coalesce(proof.captured_at, proof.created_at)
      between occurrence.created_at - parameters.proof_window
          and occurrence.created_at + parameters.proof_window
order by proof_taken_at desc;
```

A sintaxe foi validada com `EXPLAIN` e com a execução da consulta num Postgres **local e descartável**,
migrado do zero e vazio: 0 linhas.

Não há retroatividade (D4). O que a consulta achar fica como está até alguém decidir o que fazer. Uma
correção nesses dados seria migração com plano escrito e aprovação humana.
