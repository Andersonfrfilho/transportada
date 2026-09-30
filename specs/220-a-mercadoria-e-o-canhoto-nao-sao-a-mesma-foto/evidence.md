# Evidência

Uma entrada por task, com o comando rodado e a saída relevante. Task sem entrada aqui não está
fechada.

## Levantamento anterior à spec

Três explorações escopadas por app, em 29/09/2026, sobre o worktree `comprovante-duas-fotos`. O que
elas mediram e que sustenta as decisões da spec:

- **Configuração** — as três tabelas (`company_delivery_proof_settings`,
  `delivery_proof_setting_overrides`, `delivery_proof_setting_contractor_overrides`) têm um único
  campo `photo`; nenhuma tem `cargo`. `proofFormPlan.service.ts:49` do app do motorista conhece só
  `fields.photo`.
- **Pontualidade** — `trip_delivery_proofs` grava `latitude`, `longitude`, `accuracy_meters` e
  `captured_at` por linha para **todo** `kind`, inclusive `cargo` (`trip.schema.ts:1607-1613`), mas
  `attach-delivery-proof.use-case.ts:323` devolve `not_required` para tudo que não é `photo`.
- **Exibição** — o comprovante já abre **por nota** (`TripStopList.component.tsx:769-802`);
  `receivedBy`/`receivedByDetail` chegam da API desde a spec 193 e **nenhum componente os
  renderiza**; `ProofImage` (`TripDeliveryProof.component.tsx:135-139`) é uma `<img>` sem clique.
- **Miniatura** — não existe para comprovante em lugar nenhum: nem coluna no banco, nem
  `thumbnailUrl` na resposta, nem campo no tipo do painel. A spec 213, apesar do nome, é inteira
  sobre `frontend-driver` e usa `blob:` local da fila offline.
- **Próximo/anterior** — não existe em nenhuma tela do produto.
- **Chave órfã** — `deliveryProof.open` = "Abrir em tamanho real" em `trip.locale.json:466`, sem
  nenhum consumidor.
- **Conferência do canhoto** — a leitura existe e funciona (`barcodeDecoder.service.ts` com zxing,
  `canhotoOcrEngine.service.ts` com tesseract, casamento em `canhotoIdentification.service.ts` e
  `canhotoOcr.service.ts`), mas **só no assistente de baixa em campo do escritório** e só como
  sugestão no instante da criação — nada é gravado. O app do motorista não tem leitura nenhuma
  (`nenhum ocr em apps/frontend-driver/src`, confirmado pela spec 212). **Não existe estado de
  aprovado/pendente/recusado** em nenhuma tabela do domínio.
- **Qualidade de imagem** — só tamanho de arquivo, formato e magic bytes. Nitidez, foco e
  iluminação não são medidos em lugar nenhum; os códigos `blurry`/`tooDark`/… da ADR-0078 estão
  como **proposta**, sem implementação.

## Fase 1

### T1.1 — Contrato de `cargo` no `deliveryProofSettingsSchema`

Suíte nova `apps/api-transportada/test/trip-delivery-proof/cargo-settings.contract.ts`, 16 testes em
dois `describe` (`cargo` e `cargoMinimumCount`), ligada ao entrypoint por
`import './trip-delivery-proof/cargo-settings.contract'` — o entrypoint
`./test/trip-delivery-proof.contract.test.ts` já está na lista explícita do `package.json`.

Cobre: padrão de fábrica `off`/mínimo 1; `PUT` geral nos três modos; exceção por destinatário e por
contratante nos três modos; ausência aceita nas três formas e preservando o gravado (precedente
spec 193 D6); modo fora da lista → 400 no campo; campo desconhecido segue recusado pelo `.strict`;
mínimo de 1 a 5 aceito, 6 recusado com `DELIVERY_PROOF_MINIMUM_ABOVE_LIMIT` (teto da spec 184 D3,
lido de `TRIP_DELIVERY_PROOF_CARGO_LIMIT`, não de um `5` solto); 0, negativo e fração recusados; o
teto valendo também nas exceções; `readCargoRequiredCount` só cobrando o mínimo quando o modo é
`required`.

```
$ bun --env-file=../../.env.test test test/trip-delivery-proof.contract.test.ts --timeout 120000
 209 pass
 0 fail
 373 expect() calls
Ran 209 tests across 1 file. [1426.00ms]
```

### T1.2 — Migration aditiva nas três tabelas

`apps/api-transportada/drizzle/20260930021013_delivery_proof_cargo_mode/` — `migration.sql` com 12
statements, todos `ADD COLUMN` ou `ADD CONSTRAINT`: `cargo` (`text`, `DEFAULT 'off'`, `NOT NULL`,
CHECK nos três modos) e `cargo_minimum_count` (`integer`, `DEFAULT 1`, `NOT NULL`, CHECK `between 1
and 5`) em `company_delivery_proof_settings`, `delivery_proof_setting_contractor_overrides` e
`delivery_proof_setting_overrides`. Nenhum `DROP`, nenhuma troca de tipo, nenhum `NOT NULL`
retroativo sem padrão — **nada destrutivo**. Como `cargo` nasce `off`, a migration sozinha não muda
comportamento nenhum.

`rollback.sql` é manual e transacional, derruba constraints e colunas com `IF EXISTS` na ordem
inversa e falha alto se a linha do journal não sair exatamente uma vez.

⚠️ O teto de 5 fica escrito **duas vezes**: no CHECK (`between 1 and 5`) e no Zod, que o lê de
`TRIP_DELIVERY_PROOF_CARGO_LIMIT`. Manter o CHECK segue a convenção do próprio arquivo
(`proof_window_minutes between 5 and 1440`) e é defesa em profundidade, mas o comentário da
constante diz "ajustável sem migration" — e não é: subir a constante sozinha faz o Zod aceitar 6 e o
Postgres recusar com violação de constraint, ou seja, **500 no lugar de 400**. Quem subir o teto
sobe os dois, com migration.

```
$ make migration-test
 112 pass
 0 fail
 1574 expect() calls
Ran 112 tests across 8 files. [49.05s]
EXIT=0
```

⚠️ A primeira execução deste comando acusou 1 falha — `applies, constrains, rolls back, and
reapplies the fiscal migration` estourando o timeout de 30 s, com a corrida inteira levando 108 s
contra os 49 s acima. Rodava em paralelo com duas suítes de integração; sozinha, passa. Era
contenção de CPU, não regressão: fica registrado porque o mesmo falso vermelho vai reaparecer em
quem rodar tudo junto.

### T1.3 — Schema Zod, caso de uso e repositórios carregam `cargo`

`cargo` e `cargoMinimumCount` entram em `DeliveryProofFieldSettings`
(`src/trips/domain/delivery-proof-settings.policy.ts`), opcionais na entrada — ausente preserva o
gravado, como `receivedBy` desde a spec 193 D6 — e atravessam
`delivery-proof-settings.schema.ts`, `delivery-proof-settings.routes.ts`,
`read-settings-resolution.use-case.ts`, os três repositórios Drizzle e
`company-delivery-proof-settings.schema.ts`.

O tratamento de "ausente é não mexe" virou `omitUndefinedFields`, no lugar dos dois
desestruturamentos de `receivedBy` que existiam antes — dois campos opcionais já não cabiam na
forma antiga, três caberiam ainda menos.

O alcance real foi maior do que o `plan.md` previa: **21 arquivos**, não "as três tabelas e o schema
Zod". O campo reaparece em todo lugar onde o objeto de configuração é **construído** — caso de uso,
policy, três repositórios, rotas e onze arquivos de teste que já montavam o objeto inteiro.

```
$ bun run typecheck   # 7 apps
$ bunx tsc --noEmit   (api, worker, cron)
$ tsc --noEmit        (frontend, client, driver, landing)
[exited with code 0]
```

```
$ bun --env-file=../../.env.test test --timeout 120000
 8299 pass
 23 skip
 0 fail
 26881 expect() calls
Ran 8322 tests across 190 files. [46.17s]
```

`test/integration/canhoto-ocr-flag.integration.ts` foi tocado, então o segundo comando é obrigatório
— e rodou de verdade contra o Postgres, não pulou (`--env-file` presente, 765 testes executados):

```
$ bun --env-file=../../.env.test run test:integration
 765 pass
 7 skip
 0 fail
 4213 expect() calls
Ran 772 tests across 141 files. [1137.66s]
EXIT=0
```

Gate de estilo e lint da raiz, no mesmo estado da árvore:

```
$ bun run format:check   → All matched files use Prettier code style!
$ bun run lint           → ✖ 16 problems (0 errors, 16 warnings)
```

Os 16 avisos são pré-existentes (`react-hooks/exhaustive-deps` em arquivos que esta fase não toca).
O `format:check` reprovou dois arquivos na primeira passada — o `check` da app é eslint e não roda
prettier, então só o gate da raiz pega isso.

### T1.4 / T1.5 — Cascata do painel resolve `cargo`

Suíte nova `apps/frontend-transportada/test/trip/delivery-proof-settings.contract.ts`, 13 testes em
dois `describe`, ligada ao entrypoint `test/trip.contract.test.ts` — que já está na lista explícita
do `package.json`.

O primeiro `describe` cobre a cascata: fábrica `off`/1; sem linha nenhuma vale a fábrica; geral vence
fábrica; contratante vence geral **por inteiro**, modo e mínimo juntos; destinatário vence os dois; o
mínimo nunca vem de uma linha diferente da do modo; o rascunho de exceção nova parte da geral; a
guarda recusa modo fora da lista e mínimo fora de 1 a 5.

`resolveDeliveryProofSettings` é novo e é o espelho de `resolveWithOverrides` da API (spec 218
RF-C3/RF-D1). Não substitui `mergeDeliveryProofSettings`: o merge nunca resolveu cascata nenhuma — ele
só semeia o rascunho de uma exceção **nova** em `handleAddOverride`/`handleAddContractorOverride`, e a
exceção gravada vence inteira. O comentário do merge foi reescrito para dizer isso, porque ler os dois
lado a lado sem essa frase sugere duplicação onde não há. `resolveDeliveryProofSettings` ainda não tem
consumidor em componente — entra na T1.6.

⚠️ **A guarda de resposta não pode exigir os campos novos, e a primeira entrega exigia.** Painel e API
são serviços separados no Railway, e o painel é PWA com bundle em cache: na janela de deploy, e de novo
depois de uma reversão, o bundle novo conversa com a API anterior, que responde sem `cargo` nem
`cargoMinimumCount`. `isDeliveryProofFieldSettings` é consumida em **seis** pontos de
`tripClient.service.ts` (`readDeliveryProofSettings`, os dois `PUT`, `readSettingsResolution` e as duas
listas de exceção), e em todos eles a recusa não degrada um campo — ela lança
`requestError(TRIP_ERROR.RESPONSE_INVALID)` e derruba a tela de configuração inteira. É o mesmo
precedente que o próprio arquivo já registrava três linhas acima para `receivedBy` (spec 193 D6):
ausente é a API anterior, e vale o padrão.

A correção não é só afrouxar a guarda — afrouxar sozinho deixaria `cargo` opcional vazando para quem
consome. Entraram os tipos `*Wire` (`DeliveryProofFieldSettingsWire` e os três que derivam dele), que é
o formato que só as guardas produzem, mais `normalizeDeliveryProofFieldSettings`, que completa com
`off`/1 antes de sair do cliente. O compilador passa a cobrar a normalização: sem ela o `Wire` não é
atribuível a `DeliveryProofFieldSettings`. Quatro testes do segundo `describe` exercitam isso pelo
`createTripClient` real com `fetch` falso devolvendo a resposta antiga; um quinto garante que campo
**presente e inválido** (`cargoMinimumCount: 9`) continua sendo `TRIP_RESPONSE_INVALID` — tolerância
de ausência não é tolerância de lixo.

```
$ bun test ./test/trip.contract.test.ts
 1898 pass
 0 fail
 19661 expect() calls
Ran 1898 tests across 1 file. [1207.00ms]
```

A asserção desse quinto teste foi conferida trocando o código esperado por uma sentinela: a suíte foi
para `1 fail`. Um `.rejects.toBeDefined()` teria passado com qualquer erro, inclusive um `TypeError` de
digitação.

```
$ bun run typecheck    → EXIT=0 (7 apps)
$ bun run format:check → All matched files use Prettier code style!
$ bun run lint         → ✖ 16 problems (0 errors, 16 warnings)
```

Os 16 avisos são os mesmos pré-existentes da T1.3 (`react-hooks/exhaustive-deps` fora desta fase).

## Fase 2

## Fase 3

## Fase 4

## Fase 5

## Fase 6
