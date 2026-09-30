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

### T1.7 — Contrato do `proofFormPlan` com `cargo` (vermelho)

Suíte nova `apps/frontend-driver/test/driver-trip/proof-cargo-plan.contract.ts`, ligada por `import`
ao entrypoint `test/driver-trip.contract.test.ts` — que já está na lista explícita do `package.json`,
então o `package.json` não mudou.

Quatro `describe`: o que `rendersCargo` renderiza em cada modo e que canhoto e mercadoria não se
influenciam; o mínimo contando só em `required`; a pendência contada (mínimo 3 com duas fotos → falta
1, e o confirmar segue bloqueado); e o gate de `requiresProofBeforeDelivery`. A forma cobrada é
`settings.cargo` + `settings.cargoMinimumCount`, `plan.rendersCargo`, `values.cargoCount`, a chave
`'cargo'` em `listMissingProofFields` e o export novo `countMissingCargoPhotos`.

```
$ bunx tsc --noEmit                            → EXIT=0
$ bun test ./test/driver-trip.contract.test.ts
 732 pass
 11 fail
```

O vermelho é **por asserção, não por compilação**: o export ausente é lido por um `typeof` que espera
`'function'`, então a falha diz o que falta em vez de estourar um `TypeError` ao chamar `undefined`.
Os campos que ainda não existem nos tipos reais são vistos por tipos locais e um `as`, andaimes que a
T1.8 remove — enquanto eles estiverem lá, o contrato não checa tipo de verdade.

Dois testes passam hoje vacuamente (`'sem configuração no snapshot…'` e o `not.toContain('cargo')` do
teste do canhoto), porque `cargo` ainda não existe. Só passam a valer depois da T1.8.

Um nome de teste foi corrigido na revisão: prometia que o canhoto é "1 e só 1" e nenhuma asserção
cobrava isso — não há campo de mínimo do canhoto contra o que asserir. O nome passou a dizer o que o
teste de fato verifica, que é a independência entre os dois campos.

O teto de 5 (RF08) fica de fora deste contrato de propósito: ele é recusado na fronteira da API e na
tela de configuração, não no plano do motorista.

### ⚠️ As duas cópias de `proofFormPlan.service.ts` já divergiram

Medido antes da T1.8, e é o que decide o alcance dela:

|                                                                            | painel (`frontend-transportada`) | motorista (`frontend-driver`) |
| -------------------------------------------------------------------------- | -------------------------------- | ----------------------------- |
| linhas                                                                     | 89                               | 241                           |
| `receivedBy` (spec 193)                                                    | não tem                          | tem                           |
| `requiresProofBeforeDelivery` (gate da spec 218)                           | não tem                          | tem                           |
| `listPendingReceiverFields`, `buildReceiverFields`, `listAllPendingFields` | não tem                          | tem                           |

A do painel é a **origem** — o cabeçalho `Cópia por valor de … (ADR-0075 §7)` vive na do motorista, que
é a cópia. Desde a separação, a cópia andou duas specs à frente da origem e nada acusou: o
`copy-by-value-header.contract.ts` confere **só a linha do cabeçalho, nunca a paridade de conteúdo**.

Decisão desta spec: **`cargo` entra só na cópia do motorista.** O módulo `driver-trip` do painel é o
caminho legado servido enquanto `VITE_DRIVER_APP_URL` está desligado, e a spec 189 Fase 10 o remove
sob aprovação humana. Levar `cargo` para lá seria trabalho num módulo marcado para deleção, e seria
incoerente acrescentar o campo da spec 220 a um arquivo que não tem os das specs 193 e 218. O texto da
T1.8 fala em `proofFormPlan.service.ts` no singular, o que é consistente com isso.

O que essa decisão deixa em aberto, dito por extenso para não virar surpresa: transportadora que ligue
a foto da mercadoria enquanto seus motoristas ainda estão no caminho legado configura um campo que
aquele caminho não coleta nem cobra. **Não é regressão** — `cargo` nasce `off`, nada que funcionava
deixa de funcionar — e é a mesma postura que `receivedBy` já tem desde a spec 193. Some quando o
módulo legado sair.

### T1.6 — A tela de configuração passa a mostrar duas fotos

`bun test ./test/trip.contract.test.ts` em `apps/frontend-transportada`: **1903 pass, 0 fail**
(1899 antes, com os 4 novos vermelhos). `bunx tsc --noEmit` EXIT=0, `format:check` e `lint` limpos
(16 avisos, todos pré-existentes).

O painel deixou de iterar `DELIVERY_PROOF_FIELDS` e passou a iterar `PANEL_MODE_FIELDS`, que é
`[...DELIVERY_PROOF_FIELDS, 'cargo']`. A lista de exibição precisa ser outra porque
`DELIVERY_PROOF_FIELDS` também alimenta o `SettingsResolutionPanel`, que ainda não mostra a foto da
mercadoria — e o contrato antigo fixa essa lista em quatro campos. São quatro pontos de iteração no
componente (linhas 308, 331, 441, 512); o de 331 exclui `photo` e `cargo`, que ganham seção própria.

O bloco do `canhotoOcrEnabled` virou `renderCanhotoOcrSection()` e passou a ser chamado **dentro** da
seção "Foto do canhoto" (RF04). O contrato ancora a ordem na chamada `{renderCanhotoOcrSection()}`, e
não na chave de locale do título do interruptor: a chave está dentro da função extraída, e o que
determina a ordem de render é o ponto de chamada.

O mínimo da mercadoria é um `Select` de 1 a 5, gerado de
`DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE`, e **some** fora de `required` em vez de aparecer
desabilitado (RF06). Sem campo numérico digitável, não há caminho de interface que passe do teto
(RF08) — o contrato cobra a ausência de `type="number"` nesse campo.

⚠️ **Um nome de teste prometia mais do que a asserção cobrava.** O teste nasceu
`'as cinco listas de modos passam pela lista de exibição, com cargo'`; são quatro pontos, e o corpo
não conta nada — ele confere ausência de `DELIVERY_PROOF_FIELDS.map` e presença de
`PANEL_MODE_FIELDS`. Como `PANEL_MODE_FIELDS` não é exportado, a asserção não tem como olhar a
composição da lista de fora; o que dá para cobrar é exatamente o que o corpo cobra. Renomeado para
`'nenhuma lista de modos sai de DELIVERY_PROOF_FIELDS: todas passam pela do painel'` — terceiro caso
desta spec em que o nome descrevia uma asserção que não existia.

### T1.7 / T1.8 — O plano do comprovante conhece a foto da mercadoria

`bun test ./test/driver-trip.contract.test.ts` em `apps/frontend-driver`: **743 pass, 0 fail**
(11 vermelhos na T1.7). `bunx tsc --noEmit` EXIT=0; `prettier --check` e `eslint` limpos.

`countMissingCargoPhotos({ plan, values })` devolve `max(0, mínimo − cargoCount)` e 0 fora de
`required` (RF06); `listMissingProofFields` inclui `'cargo'` quando esse número é maior que zero
(RF09); `requiresProofBeforeDelivery` passa a considerar `cargo: 'required'` (spec 218 RF-A1).
`ProofFieldKey` deixou de ser `keyof` puro — sem o `Exclude`, `'cargoMinimumCount'` viraria chave de
pendência.

**Sentinela:** tirado o `Math.max(0, …)`, a suíte foi a **742 pass / 1 fail**
(`'mais fotos que o mínimo nunca produz falta negativa'`), e voltou a 743/0 com o clamp restaurado.
O contrato morde.

`attachCargo` envia `kind: 'cargo'` e a foto entra na fila mesmo abaixo do mínimo — é **pendência de
confirmação, não recusa de anexo** (RF09). O teto de 5 (`PROOF_CARGO_PHOTO_LIMIT`, cópia por valor de
`TRIP_DELIVERY_PROOF_CARGO_LIMIT`) é aplicado escondendo os botões quando a lista enche.

Uma asserção de contrato existente mudou de valor: em `proof-queued-at-mount.contract.ts`, nota sem
nada na fila passou de `toEqual({})` para `toEqual({ cargo: [] })`, porque a mercadoria acumula e a
lista existe sempre. O teste continua cobrando o mesmo — "nota alheia não entra" —, e deixar `cargo`
opcional para preservar o `{}` literal só empurraria um `?? []` para cada consumidor. As outras
cinco fixtures ganharam apenas campos novos; `git diff -U0` não mostra nenhuma asserção removida.

⚠️ **A ressalva do executor sobre o snapshot não se confirmou.** O relatório da T1.8 disse que a API
não emite `cargo` nem `cargoMinimumCount` no snapshot do motorista, e que isso viraria item novo no
`tasks.md` — mas o próprio relatório avisava que isso não tinha sido verificado do lado da API.
Verificado: `drizzle-current-driver-trip.repository.ts` seleciona e monta os dois campos nas três
camadas da cascata (linhas 650-651, 663-664, 678-679, 696-697, 710-711), e
`me-trip.routes.ts:253` repassa `stops` inteiro sem escolher campo. O `DeliveryProofFieldSettings`
da API carrega `cargo` desde a T1.3, então o compilador já cobrava isso. **Não há lacuna e não há
task nova.** Registrado porque um item inventado no `tasks.md` custa tanto quanto um item que falta.

## Fase 2

## Fase 3

## Fase 4

## Fase 5

## Fase 6
