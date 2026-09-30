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

### T1.9 — Revisão de design da configuração (`web.md` §15)

Revisão feita contra a própria página, `http://localhost:53112/trips` → aba **Comprovante**, com API e
painel servidos do worktree e a migration da T1.2 já aplicada no Postgres local.

**Os dois campos existem e estão na ordem da RF04.** Árvore de acessibilidade do bloco geral:
`Foto do canhoto` → `Ligar a leitura do canhoto` → `Foto da mercadoria`. O interruptor do OCR está
**dentro** do cartão do canhoto, não entre os dois campos. As três tabelas (geral, exceção por
destinatário, exceção por contratante) trazem os cinco modos: 16 gatilhos `aria-haspopup="listbox"`
na página, `Foto da mercadoria` em cada um dos três blocos.

**O mínimo só aparece em `required`, e é escolha, não digitação.** Com `cargo: 'off'` (a fábrica)
não há campo de mínimo na página. Trocado para `Obrigatório`, nasce
`Mínimo de fotos da mercadoria`, com as opções exatamente `1 2 3 4 5` —
`DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE` na tela, sem `input type="number"` capaz de passar do teto
de 5 (spec 184 D3).

**Comparado com o campo vizinho, é o mesmo campo.** Medido no DOM, os blocos do canhoto e da
mercadoria são idênticos em token: rótulo `12.8px/400`, valor `14.4px/400`, mesma cor, mesma largura
(1164 px) e mesma altura (70 px). Nenhum estouro horizontal (`scrollWidth === clientWidth`).

**Contraste nos dois estados** (razão WCAG calculada da cor computada sobre o fundo efetivo):

| tema   | elemento                                         | cor                  | fundo             | razão     |
| ------ | ------------------------------------------------ | -------------------- | ----------------- | --------- |
| claro  | rótulo `Mínimo de fotos da mercadoria` (12.8 px) | `rgb(85, 101, 110)`  | `#fbf9f5`         | **5,7:1** |
| claro  | valor do gatilho (14.4 px)                       | `rgb(29, 43, 51)`    | `#f2efe9`         | ≫ 7:1     |
| escuro | rótulo e texto de apoio (12.8 px)                | `rgb(154, 172, 181)` | `rgb(28, 43, 51)` | **6,2:1** |
| escuro | valor do gatilho (14.4 px)                       | `rgb(240, 242, 238)` | `rgb(16, 34, 44)` | ≫ 7:1     |

O piso do texto pequeno é 4,5:1 — passa nos dois temas, com folga. O rótulo e o texto de apoio
compartilham o mesmo token no tema escuro, igual aos campos vizinhos: não é regressão desta spec.

⚠️ **O `<Select>` do design system não abre por clique sintético ingênuo.** É componente próprio
(`src/components/ui/select.tsx`), não Radix e não `<select>` nativo: `onClick` no `<button>`,
`onKeyDown` na raiz, lista em portal. Cinco tentativas falharam antes de acertar — clique por `ref`,
clique por coordenada, `PointerEvent` sintético, foco + Enter. O que funciona é `element.click()`
**relendo o elemento do DOM na mesma chamada** e esperando o re-render antes de reconsultar
`aria-expanded`; a leitura em chamada separada pegava referência velha. Fica registrado para as
revisões de design das Fases 4 e 5, que mexem nos mesmos controles.

Rascunho deixado sem gravar: o painel tem botão `Salvar configuração`, e a revisão não precisava do
`PUT` — o caminho de escrita já está coberto pelos contratos da T1.1 à T1.3. Recarregar a página
devolve a fábrica.

## Fase 2

### T2.1 — Contrato do veredito da foto da mercadoria (vermelho)

`describe` novo ao fim de `apps/api-transportada/test/trip-delivery-proof/punctuality.contract.ts`,
já registrado na lista do `package.json` pelo entrypoint `test/trip-delivery-proof.contract.test.ts`
— nenhum arquivo novo, nenhuma mudança em `src/`.

⚠️ O `tasks.md` da T2.1 cita `test/trip/delivery-proof-punctuality.contract.ts`, que **não existe**.
O arquivo real é `test/trip-delivery-proof/punctuality.contract.ts`.

Os três casos chamam `attachDeliveryProof` com `kind: 'cargo'`, dublê local de `DeliveryProofPort`
no molde de `late-registration.contract.ts`: entrega às 12:00, foto às 14:00, 800 m do ponto.

```
bun --env-file=../../.env.test test --timeout 120000 test/trip-delivery-proof.contract.test.ts
211 pass · 1 fail · 376 expect()
```

| caso                                               | hoje      | motivo                                                       |
| -------------------------------------------------- | --------- | ------------------------------------------------------------ |
| `cargo: 'required'`, 800 m e 2 h → `late_and_away` | **falha** | `Expected: "late_and_away"` · `Received: "not_required"`     |
| canal `office` → `not_required`                    | passa     | o portão fechado já devolve `not_required` para todo `cargo` |
| `cargo: 'off'` → `not_required`                    | passa     | idem                                                         |

Só o primeiro caso morde antes da T2.3, e morde pelo motivo certo: o portão de
`attach-delivery-proof.use-case.ts:323` barra `cargo` antes de qualquer classificação. Os outros dois
são guarda de regressão — passam a valer quando o portão abrir, garantindo que `office` (ADR-0070
§2-6) e `cargo: 'off'` continuam fora do veredito.

### T2.2 — Contrato dos vereditos independentes (vermelho)

`describe` novo no mesmo arquivo: `cada foto da mercadoria guarda o próprio veredito (spec 220 RF10)`,
com helper próprio `attachOnTimeProof` no molde do da T2.1.

O que ele prende: a fusão de `attach-delivery-proof.use-case.ts:238` existe porque `photo` e
`signature` **substituem** (índice único `company, stop_event, kind`, spec 159 T11). `cargo` **soma** —
o índice parcial da spec 184 exclui `cargo` (`targetWhere` em
`drizzle-delivery-proof.repository.ts:345`), e `findProofPunctuality` faz `limit(1)` **sem
`order by`**, então a "anterior" é uma linha qualquer entre as cinco. Fundir contamina.

Limiares lidos em `DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS`
(`src/trips/domain/delivery-proof-settings.policy.ts:82`): raio de 300 m, janela de 60 min, folga de
relógio de ±2 min em `resolveTimeReference`. Cenário: entrega às 12:00, foto na mesma posição,
`capturedAt` 12:10 — 10 min de atraso contra uma janela de 60.

```
bun --env-file=../../.env.test test --timeout 120000 test/trip-delivery-proof.contract.test.ts
212 pass · 3 fail
```

| caso                                                | hoje                                    |
| --------------------------------------------------- | --------------------------------------- |
| anterior `late_and_away`, foto em ordem → `on_time` | **falha** · `Received: "late_and_away"` |
| anterior `late`, foto em ordem → `on_time`          | **falha** · `Received: "late"`          |
| guarda: `photo` com anterior `late` continua `late` | passa                                   |

O `Received` é o veredito **antigo**, não `not_required`: a fusão devolve o `previous` quando o
`next` é `not_required`. Os dois casos falham por dois motivos somados — o portão fechado e a fusão.
Abrir só o portão não os deixa verdes, e é isso que o contrato cobra.

### T2.3 — O portão abre para `cargo` (verde)

O `tasks.md` descreve a task como uma linha ("abre o portão em
`attach-delivery-proof.use-case.ts:323`"). O reconhecimento antes de implementar achou mais três
mudanças soldadas nela — sem qualquer uma, os contratos da T2.1/T2.2 não ficam verdes:

| #   | mudança                                                          | onde                                | por quê                                       |
| --- | ---------------------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| a   | o portão do veredito aceita `cargo`                              | `attach-delivery-proof.use-case.ts` | T2.1                                          |
| b   | `cargo` sai da fusão — cada foto guarda o seu                    | mesmo arquivo                       | T2.2                                          |
| c   | um **segundo** portão recusava `cargo` com 400 antes do primeiro | `delivery-proof.schema.ts:128`      | a rota do motorista nunca chegava ao use case |
| d   | o teto de cinco só existia no caminho do escritório              | use case + repositório              | RF08 diz "por entrega", não por canal         |

O (c) é o que tornava a task maior do que parecia: `parseDeliveryProofUpload` validava o `kind`
contra `DRIVER_PROOF_KINDS`, que não continha `cargo`. O JSDoc da spec 184 explicava a tranca —
`cargo` ficou fora da rota do motorista "sem o teto de cinco e sem a deduplicação do escritório; um
retry em laço gravaria sem fim". Destrancar **com** o teto (d) é o que fecha aquele motivo, não o
que o ignora.

`DRIVER_PROOF_KINDS` tinha dois consumidores com sentidos diferentes: o que o motorista **envia** e
as linhas que carregam **quem recebeu** (spec 193 D7 — `cargo` nunca carrega recebedor). Alargar a
constante no lugar faria o patch de recebedor tentar escrever em linha de carga. Foi partida em
`DRIVER_UPLOAD_PROOF_KINDS` e `DRIVER_RECEIVER_PROOF_KINDS`, e o nome ambíguo apagado.

```
bun --env-file=../../.env.test test --timeout 120000
8309 pass · 23 skip · 0 fail · 26892 expect() · 190 arquivos · 34,47 s   EXIT=0
bunx tsc --noEmit                                                        EXIT=0
git diff --stat                     17 arquivos · 406 inserções · 39 remoções
```

Antes da implementação, o contrato do teto falhava como devia: `Expected promise that rejects /
Received promise that resolved` na sexta foto.

Dois efeitos colaterais, os dois fora do roteiro e os dois registrados aqui por isso:

- **Um sétimo dublê apareceu só no `tsc`** — `test/driver-trip/office-field-delivery.contract.ts`
  tinha dois dublês de `DeliveryProofPort` que o levantamento não listou. O método novo entrou neles.
- **`proof-location-parse.contract.ts` afirmava o contrário da decisão (c)**: havia um
  `recusa cargo com 400`. O bloco foi reescrito para os três tipos aceitos + um desconhecido
  recusado. Nenhuma outra asserção mudou.

#### O teto do motorista é verificação, não trava — e fica assim

A contagem do motorista (`countProofsForEvent` em `drizzle-delivery-proof.repository.ts`) é um
`count(*)` solto; o `saveProof` abre a própria transação **depois**. O caminho do escritório resolve
isso travando a linha do evento (`for('no key update')` sobre `trip_stop_events`, dentro da mesma
transação da gravação) — mecanismo que a própria revisão da spec 184 registrou no JSDoc de
`drizzle-driver-field-report.repository.ts:939`.

Medido antes de decidir: **a fila offline do motorista drena em série** —
`offlineAttachments.service.ts:496` é um `for` com `await input.sendAttachment(attachment)` dentro.
A rajada de reenvio, que era o motivo de suspeitar da corrida, não corre contra si mesma. Sobra o
caso de dois clientes distintos enviando carga para a mesma entrega no mesmo instante, exatamente
com quatro fotos gravadas — e o resultado é uma sexta foto, não perda de dado.

Cinco é guarda de produto ("cobre a avaria e o contexto sem transformar a baixa em álbum", spec 184
D3), não invariante de segurança. A verificação antes do `storage.store` (use case, linha ~253)
continua valendo por outro motivo além do teto: recusa **antes** de escrever o objeto no bucket.
Fechar a janela custaria dar ao caminho do motorista uma fronteira de transação que ele não tem
hoje — refatoração maior que a T2.3 e fora do `tasks.md`. Fica escrito em vez de fechado; quem
precisar fechar, o molde é o do escritório, citado acima.

#### Pendência de tela, fora da Fase 2

O app do motorista não tem teto nenhum no cliente: o `DriverStopCard` deixa somar fotos sem limite.
Com a T2.3 o servidor devolve 422 na sexta, então o motorista vê erro em vez de botão desabilitado.
É polimento de tela — sugerido para a Fase 4 ou 5.

### T2.4 — Portão de qualidade e commit (verde)

O gate completo do monorepo, da raiz do worktree:

```
make check
API      8300 pass ·  0 fail · 190 arquivos
worker   1458 pass ·  0 fail ·  94 arquivos
cron      101 pass ·  0 fail ·   8 arquivos
frontend 5773 pass ·  0 fail ·  31 arquivos
                                            EXIT=0
```

A primeira passada voltou **EXIT=2**, e não era código: o `format:check` da **raiz** cobre
`specs/**/*.md` e reprovou o próprio `evidence.md` desta spec. `bunx prettier --write` no arquivo, e
a segunda passada fechou em zero. O `check` de app é eslint — quem confia nele não vê essa reprovação.

A integração da API rodou à parte, porque o diff mexe em `test/integration/delivery-proof-received-by.integration.ts`
e a T2.3 mexeu no repositório — e `bun test` não enxerga `*.integration.ts`:

```
bun --env-file=../../.env.test run test:integration
765 pass · 7 skip · 0 fail · 772 testes · 141 arquivos · 986,39 s   EXIT=0
```

Commit isolado da Fase 2, 17 arquivos, nada de trabalho vizinho na árvore.

## Fase 3

### T3.1

Contrato em `apps/frontend-driver/test/driver-trip/proof-thumbnail.contract.ts` (importado no
entrypoint `driver-trip.contract.test.ts`). Afirma, sobre `proofPhotoReduction.service.ts`:

- a régua: lado maior 320 px, qualidade inicial 0,7, alvo 60 KiB, teto duro 128 KiB (RF17);
- `buildProofPhotoWithThumbnail({ original, encodeThumbnail })` codifica uma vez, em 320 px, e
  devolve `{ original, thumbnail }`;
- miniatura de exatamente 128 KiB passa; 128 KiB + 1 byte é descartada e o original segue;
- `encodeThumbnail` que rejeita não derruba nada: `{ original }` sem miniatura (RF19).

O contrato acessa os símbolos por cast tipado do módulo (`ProofThumbnailApi`), porque ainda não
existem e o `tsc --noEmit` precisa fechar em 0; a T3.3 troca o cast por `import` direto.

```
bunx tsc --noEmit                      EXIT=0
bun run --cwd apps/frontend-driver test
error: expect(received).toBe(expected)
Expected: 320
Received: undefined
TypeError: buildProofPhotoWithThumbnail is not a function. (In 'buildProofPhotoWithThumbnail({ ... })',
'buildProofPhotoWithThumbnail' is undefined)
849 pass · 4 fail · 853 testes · 3 arquivos   (os 4 são exatamente os de proof-thumbnail)
```

Correção de rota: a T3.3 dizia "reusando o canvas de `occurrencePhotoImage.service.ts`". O canvas mora
lá, mas a porta de entrada do comprovante é `proofPhotoReduction.service.ts`, onde a miniatura
nasce; a linha da T3.3 no `tasks.md` passou a nomear os dois.

### T3.2 — Migration aditiva da miniatura

Pasta `apps/api-transportada/drizzle/20260930110332_delivery_proof_thumbnail/` (`migration.sql`,
`rollback.sql`, `snapshot.json`; o snapshot vem do `db:generate`).

- `trip_delivery_proofs.thumbnail_object_id uuid` sem default: só metadados, sem reescrita.
- FK composta `(company_id, thumbnail_object_id)` para `stored_objects(company_id, id)`, `RESTRICT`
  / `CASCADE` (`SET NULL` fica descartado: anularia `company_id`, `NOT NULL`); a coluna nula passa
  porque FK composta é `MATCH SIMPLE`. Índice parcial `WHERE thumbnail_object_id is not null`.
- `stored_objects_purpose_check` ampliado com `trip_delivery_proof_thumbnail`, em `DROP` / `ADD ...
NOT VALID` / `VALIDATE` (molde da `20260925111600`).
- Custo de lock, declarado no topo do `migration.sql`: o `ADD CONSTRAINT ... FOREIGN KEY` toma
  `SHARE ROW EXCLUSIVE` em `trip_delivery_proofs` **e** em `stored_objects`, tabela compartilhada com
  NF-e, CT-e, MDF-e e e-mail. A coluna é 100 % `NULL`, então a validação varre pouco; o precedente da
  base (nenhuma migration usa `FOREIGN KEY ... NOT VALID`) foi mantido.
- Decisão (a): a miniatura nasce com `retention_until` nulo, igual ao original. O purpose novo
  **não** entra em `TRIP_OCCURRENCE_ATTACHMENT_STORAGE_PURPOSES` do worker: o gateway do purge da 161
  está amarrado a `trip_document_occurrence_attachments` e apagaria a miniatura como órfã. Nenhuma
  mexida no worker.
- Gates literais que a task não citava e que foram atualizados: a lista de pastas em
  `test/database-migration/static-migration.contract.ts` e o CHECK esperado em
  `test/nfe-schema/storage.contract.ts`.

Pendência nomeada para a T3.3/T3.6: `buildProofUpsertSet`
(`drizzle-delivery-proof.repository.ts:419-445`) precisa carregar `thumbnailObjectId` no `set` da
recaptura; sem isso a recaptura troca o original e mantém a miniatura velha.

```
bunx tsc --noEmit                                                     EXIT=0
make migration-test                                                   EXIT=0  (112 pass · 0 fail)
bun --env-file=../../.env.test test --timeout 120000 (apps/api-transportada)
                                                                      EXIT=0  (8309 pass · 23 skip · 0 fail)
```

### T3.3 — Miniatura gerada no app do motorista e aceita pela API

**Cliente (`apps/frontend-driver`).** `proofPhotoReduction.service.ts` ganha as quatro constantes da
régua e `buildProofPhotoWithThumbnail({ original, encodeThumbnail })`, com o encoder injetado como
`fitProofPhotoWithinCap`; `reduceProofPhotoToJpeg` reusa a mesma imagem já decodificada e o canvas de
`encodeImageToJpeg` (que ganhou `startQuality` opcional, para a miniatura sair a 0,7). O canvas
descarta o EXIF, GPS inclusive, então a miniatura herda a privacidade do original. A miniatura viaja
em `QueuedAttachment.thumbnail`; `replaceAttachmentBlob` a grava junto do arquivo trocado e a
descarta quando a troca vem sem uma nova. O envio (laço serial, intacto) a leva no campo multipart
`thumbnail` de `attachProof`.

Troca do cast por `import` nomeado: `proof-thumbnail.contract.ts` (T3.1) deixou de usar
`ProofThumbnailApi` e importa os símbolos direto de `proofPhotoReduction.service`; o `tsc` agora o
confere contra a implementação. Nenhum caso do contrato foi alterado.

Divergência do briefing: além do RF19, `buildProofPhotoWithThumbnail` descarta a miniatura quando
`original + miniatura` passa de 1000 KiB. O corpo inteiro da API para em 1 MiB (413 antes da rota) e
o original chega a 960 KiB; sem a guarda, original no teto mais miniatura prenderia a foto na fila.
O contrato da T3.1 (800 KiB + 128 KiB) continua verde. Teste: `proof-thumbnail-queue.contract.ts`.

**API (`apps/api-transportada`).** `delivery-proof.schema.ts` aceita o campo `thumbnail` (ausente ou
vazio = sem miniatura; texto no lugar do arquivo = 400). `attach-delivery-proof.use-case.ts` confere
tipo e o teto de `DELIVERY_PROOF_THUMBNAIL_MAX_BYTES` (128 KiB) **antes** de tocar o bucket, guarda o
segundo objeto e o passa a `saveProof`. `drizzle-delivery-proof.repository.ts` grava o `stored_objects`
com `purpose: 'trip_delivery_proof_thumbnail'` e `retention_until` nulo, na mesma transação, e preenche
`thumbnail_object_id`.

Pendência da T3.2 fechada: `buildProofUpsertSet` carrega `thumbnailObjectId` no `set` da recaptura,
e recaptura sem miniatura o **zera** (a antiga é do original que saiu). Contrato próprio:
`test/trip-delivery-proof/proof-thumbnail.contract.ts`, importado em `trip-delivery-proof.contract.test.ts`.

Falha literal do contrato da API, capturada antes de implementar (só a constante do teto existia):

```
(fail) o campo thumbnail do multipart do /proof > arquivo presente vira bytes e tipo
(fail) o campo thumbnail do multipart do /proof > texto no lugar do arquivo é 400
(fail) o caso de uso grava a miniatura ao lado do original > com miniatura, guarda o segundo objeto e o entrega ao repositório
(fail) o caso de uso grava a miniatura ao lado do original > exatamente 128 KiB passa
(fail) o caso de uso grava a miniatura ao lado do original > um byte acima de 128 KiB é recusado antes de tocar o bucket
(fail) o caso de uso grava a miniatura ao lado do original > tipo que não é imagem aceita é recusado
 (mais 2 de buildProofUpsertSet: toMatchObject com thumbnailObjectId)
 222 pass
 8 fail
```

Não toquei `test/integration/**`; a gravação do `stored_objects` da miniatura contra Postgres real
fica para a T3.9 (`test:integration`).

```
apps/frontend-driver:  bunx tsc --noEmit                                  EXIT=0
apps/frontend-driver:  bun run test                                       857 pass · 0 fail   (os 4 da T3.1 verdes)
apps/frontend-driver:  bun run check                                      verde (6 pass · 0 fail no dist)
apps/api-transportada: bunx tsc --noEmit                                  EXIT=0
apps/api-transportada: bun --env-file=../../.env.test test --timeout 120000
                                                                          EXIT=0  (8320 pass · 23 skip · 0 fail)
eslint apps/api-transportada/src/trips + test/trip-delivery-proof         EXIT=0
```

### T3.4 — Miniatura no assistente do escritório; assinatura fica sem

**Painel** (`apps/frontend-transportada`): `fieldDeliveryImage.service.ts` reimplementa a régua (320 px, qualidade 0,7, alvo 60 KiB, teto 128 KiB, orçamento de corpo 1000 KiB) em `buildFieldDeliveryImageWithThumbnail` (pura) e `createFieldDeliveryThumbnail` (canvas). A miniatura sai do JPEG final que sobe, no envio, dentro de `useFieldDelivery` (`buildThumbnail`, opcional), então cobre a foto do canhoto (recortada ou não) e as fotos de carga. `tripClient` anexa o campo `thumbnail` em `field-delivery` e `field-proof` só quando existe. Falha, teto estourado ou original + miniatura > 1000 KiB descartam a miniatura, e o original segue (RF19).

**API**: as duas rotas do escritório aceitam `thumbnail` opcional (`readOfficeMultipartThumbnail`); tipo de imagem e teto de 128 KiB são validados antes do bucket (`assertImageAccepted`); `persistOfficeProof` grava um segundo `stored_objects` (`trip_delivery_proof_thumbnail`, `retention_until` nulo) e preenche `thumbnail_object_id`. Sem miniatura continua sendo o caso normal.

**Assinatura — decisão: NÃO gera miniatura.** O PNG nasce em canvas 600x240 com `lineWidth` 3 (`SignaturePad.component.tsx`). Medido gerando PNGs 600x240 com traços de 3 a 100 curvas de 400 passos e espessura equivalente ou maior: 4,0 a 13,2 KiB (traço grosso e denso 13,2 KiB, maior valor medido). Já é ~4,5x menor que o alvo de miniatura (60 KiB); uma miniatura de 320 px de um PNG de ~13 KiB não pouparia bytes de leitura relevantes e só criaria um segundo objeto. Além disso, o escritório nunca coleta assinatura (ADR-0067 §5), então o canal do escritório não tem o que gerar; no app do motorista a assinatura segue sem miniatura, e RF20 (fallback para o original) cobre a leitura.

**Divergências do briefing**: não há assinatura no fluxo do escritório; o repositório de lote de ocorrência guarda foto de ocorrência, não comprovante de entrega (fora de escopo); a cópia legada do painel do motorista (`/minha-viagem`) não foi alterada.

**Falhas literais antes de implementar**

- API: as suítes `office-proof-thumbnail.contract.ts` falhavam (rota ignorava `thumbnail`, `persistOfficeProof` gravava 1 objeto).
- Painel `bun test test/trip.contract.test.ts`: `SyntaxError: Export named 'buildFieldDeliveryImageWithThumbnail' not found in module '.../fieldDeliveryImage.service.ts'`.
- Painel `bun test --preload ./test/trip-hooks/dom.preload.ts ./test/trip-hooks.contract.test.ts`: `(fail) useFieldDelivery — fotos da carga (spec 184 D5) > a miniatura gerada por nota chega à baixa e à foto de carga (spec 220 T3.4)`.
- `bunx tsc --noEmit` no painel: `TS2305: ... has no exported member 'buildFieldDeliveryImageWithThumbnail'`.

**Comandos**

- `cd apps/frontend-transportada && bunx tsc --noEmit` -> EXIT=0
- `cd apps/frontend-transportada && bun run test` -> 5781 pass + 61 pass (hooks), 0 fail
- `cd apps/api-transportada && bunx tsc --noEmit` -> EXIT=0
- `cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000` -> 8330 pass, 0 fail
- `test/integration/**` não foi tocado; integração não rodada.

### T3.5 — Contrato da leitura com miniatura (vermelho)

Estendido `apps/api-transportada/test/trip-delivery-proof/read.contract.ts` (já importado por
`trip-delivery-proof.contract.test.ts`, que está na lista do `package.json`); nenhum arquivo paralelo.
Bloco `miniatura do comprovante (spec 220 RF20)`, seis casos:

- com miniatura, `thumbnailUrl` vem ao lado de `downloadUrl`, sem `objectKey` nem `thumbnail` no corpo;
- sem miniatura (comprovante antigo, assinatura, registro sem o campo) o campo é **omitido** (RF20 e
  o precedente 161 D14: ausente, nunca `null`);
- RNF01: dublê que conta chamadas ao assinador. Três comprovantes, dois com miniatura = exatamente 5
  chamadas, todas em voo ao mesmo tempo (`maxInFlight === 5`), o que reprova original-depois-miniatura;
- as duas URLs assinadas com `expiresInSeconds` 300, pelo gateway real com storage falso;
- o cursor de listagem (`createListTripOccurrenceFeedUseCase`) não consulta localização de anexo
  nem publica `thumbnailUrl`.

Forma do registro que a T3.6 deve adotar: `DeliveryProofRecord.thumbnail: { bucket, mimeType, objectKey } | null`
(mesma forma de `OccurrenceAttachmentLocation`); o contrato o injeta em objetos não frescos, sem cast.

Falha literal, antes de implementar (`bun --env-file=../../.env.test test --timeout 120000`):

```
(fail) ... miniatura do comprovante (spec 220 RF20) > com miniatura, thumbnailUrl vem ao lado de downloadUrl, ambas assinadas
(fail) ... miniatura do comprovante (spec 220 RF20) > o detalhe assina só o que existe, e tudo de uma vez
(fail) ... miniatura do comprovante (spec 220 RF20) > as duas URLs valem 5 minutos
 8333 pass
 3 fail
```

Os três casos de omissão e de cursor passam desde já: são guardas de regressão. O cursor não tem
como falhar hoje, porque o caso de uso de listagem nem recebe assinador; a asserção existe para
quebrar no dia em que alguém injetar um. Sem cast, sem dívida para a T3.6. `bunx tsc --noEmit` EXIT=0.

### T3.6 — `readDeliveryProofs` assina no mesmo lote (verde)

- `read-delivery-proof.use-case.ts`: `DeliveryProofRecord.thumbnail?: { bucket, mimeType, objectKey } | null`
  (opcional: o contrato injeta registros sem o campo, "anteriores à coluna") e `DeliveryProofView.thumbnailUrl?`,
  omitido, nunca `null`. Por comprovante, original e miniatura são pedidos ao assinador na mesma
  expressão de um `Promise.all`, dentro do `Promise.all` externo: as 5 chamadas do caso RNF01 partem
  antes de qualquer `await` retornar (`maxInFlight === 5`). Sem `await` em laço.
- `delivery-proof-read.support.ts`: alias `trip_delivery_proof_thumbnail` de `stored_objects` com
  `leftJoin` por `company_id` **e** `id = thumbnail_object_id` (tenant em cada junção, como as demais).
- Validade: o gateway já usa `DOWNLOAD_EXPIRES_IN_SECONDS = 300` para toda chamada; nada redeclarado.
- **Decisão `Promise.all` vs `allSettled`**: `Promise.all`. Uma URL faltando quebra a tela do
  comprovante; `allSettled` só esconderia o defeito.
- `bunx tsc --noEmit` EXIT=0. `bun --env-file=../../.env.test test --timeout 120000`: 8336 pass, 23 skip,
  0 fail (as 3 falhas da T3.5 verdes). Integração (`test:integration`) não rodada: é a T3.8.

### T3.7 — `ProofImage` usa a miniatura, com queda para o original

Contrato novo `apps/frontend-transportada/test/trip/delivery-proof-thumbnail.contract.ts`, importado por
`test/trip.contract.test.ts` (já na lista do `package.json`). Quatro casos: com `thumbnailUrl` o `src`
é a miniatura; sem ela é o original (comprovante antigo, assinatura); a URL de tela cheia é o
original nos dois casos (RF22); a validação da resposta aceita e preserva `thumbnailUrl`.

Falha literal, antes de implementar (`bun test test/trip.contract.test.ts`):

```
SyntaxError: Export named 'resolveDeliveryProofFullSizeUrl' not found in module '.../trip/shared/deliveryProof.service.ts'.
 0 pass
 1 fail
```

O vermelho é de import (as funções não existiam), que derruba a suíte inteira do entrypoint.

O que mudou:

- `deliveryProof.service.ts`: `DeliveryProof.thumbnailUrl?` e duas funções puras,
  `resolveDeliveryProofImageSource` (`thumbnailUrl ?? downloadUrl`) e `resolveDeliveryProofFullSizeUrl`
  (`downloadUrl`).
- `TripDeliveryProof.component.tsx`: `ProofImage` usa `resolveDeliveryProofImageSource(proof)`.
- ⚠️ **Sem a validação, a miniatura faria o comprovante sumir.** `isDeliveryProof` usa `hasKeys` com
  lista fechada, e `deliveryProofsFromApi` descarta em silêncio o item inválido: com a API da T3.6
  servindo `thumbnailUrl`, todo comprovante com miniatura sairia da tela, com 200 na rede e nada no
  console. `thumbnailUrl` entrou em `DELIVERY_PROOF_OPTIONAL_KEYS` (`trip.constant.ts`) e em
  `isDeliveryProof` (`tripResponse.validation.ts`), com `isString` quando presente.
- `delivery-proof-panel.contract.ts`: a guarda "não guarda a URL assinada em estado próprio" olhava a
  fonte por `proof.downloadUrl`; passou a olhar `resolveDeliveryProofImageSource(proof)`. A garantia
  (a URL vem direto da consulta, sem `useState<string`) é a mesma.

RF22: hoje `ProofImage` é um `<img>` sem clique, link ou `download`; não há caminho de tela cheia para
contaminar. A regra ficou garantida onde a Fase 5 (T5.3) vai buscá-la: `resolveDeliveryProofFullSizeUrl`
devolve sempre `downloadUrl`, com contrato nos dois casos. A galeria deve consumir essa função, não
`resolveDeliveryProofImageSource`.

`bunx tsc --noEmit` EXIT=0. `bun run test` da app (inclui `test:hooks`): 5785 pass, 0 fail
(`trip.contract.test.ts`: 1915 pass, 0 fail; `test:hooks`: 61 pass, 0 fail). Lint: 0 erros.

### T3.8 — A miniatura contra o Postgres de verdade

`apps/api-transportada/test/integration/delivery-proof-thumbnail.integration.ts`, na lista explícita
do `test:integration` do `package.json` (140 arquivos). Cenário montado pelos casos de uso reais
(`reportDocumentDelivery`, `attachDeliveryProof`, `parseDeliveryProofUpload`) sobre as fixtures de
`trip-field-office-database.fixture.ts` — sem `INSERT` bruto de domínio.

Cinco casos, e os dois do meio são os que **nenhum dublê alcança**:

1. Com miniatura: duas linhas em `stored_objects` (`delivery_proof` e `trip_delivery_proof_thumbnail`),
   `trip_delivery_proofs.thumbnail_object_id` apontando para a segunda, e a leitura devolvendo as duas
   URLs assinadas.
2. Sem miniatura: o `leftJoin` **não derruba a linha** — `downloadUrl` presente e `thumbnailUrl`
   ausente da chave (`'thumbnailUrl' in view === false`, não `null`). É o defeito clássico de trocar
   `leftJoin` por `innerJoin`, invisível com dublê.
3. Tenant: `listDeliveryProofs` com a empresa errada devolve `[]`; com a certa, devolve 1 com miniatura.
4. **FK composta e `RESTRICT`, os dois em ação:** apontar o comprovante para a miniatura de outra
   empresa é recusado pelo banco, e apagar o objeto em uso também — o vínculo continua de pé depois
   das duas tentativas. Era a única prova possível de que a FK composta da T3.2 está escopada por
   empresa, e não só por id.
5. `retention_until` das duas linhas nasce `null`, fixando a decisão da T3.2 (dívida aberta em
   `docs/SECURITY.md`, não comportamento desejável).

Arquivo sozinho: `bun --env-file=../../.env.test test ./test/integration/delivery-proof-thumbnail.integration.ts`
→ **5 pass · 0 fail · 19 expect · 10,42 s** · EXIT=0.

⚠️ O caminho precisa do `./`: sem ele o Bun trata o argumento como filtro de nome, não casa com
`.integration.ts` e responde `0 files` com EXIT=1 — verde nenhum, mas fácil de ler como "não quebrou".

Suíte inteiro: `bun --env-file=../../.env.test run test:integration`
→ **770 pass · 7 skip · 0 fail · 777 testes · 142 arquivos · 1081,12 s** · EXIT=0.
Referência anterior (T2.4): 765 pass · 141 arquivos. A diferença é exatamente este arquivo.

Nota de execução: o primeiro agente desta task ficou esperando um processo que já tinha morrido, e o
suíte foi relançado à mão. Nenhum efeito sobre o resultado — só relógio perdido.

### T3.9 — portão da Fase 3

`make check` na raiz → **EXIT=0**. Contagens por app, todas com 0 fail:

| App                     | Testes             |
| ----------------------- | ------------------ |
| `api-transportada`      | 8327               |
| `worker-transportada`   | 1458               |
| `cron-transportada`     | 101                |
| `frontend-transportada` | 5785 + 61 de hooks |
| `frontend-driver`       | 857                |
| `frontend-client`       | 114 + 89 + 6       |

Lint: 16 avisos, 0 erros — os 16 são `react-hooks/exhaustive-deps` que já existiam antes da spec.
`bunx prettier --write` nos quatro arquivos da spec: nenhum mudou.

`make migration-test` (T3.2) e `test:integration` (T3.8) já estão registrados acima; o `bun test` do
`make check` **não** enxerga `test/integration/**`, por isso os dois contam separado.

Commit da fase: `81c135f51` — 52 arquivos, 10 novos (a migration com `migration.sql`,
`rollback.sql` e `snapshot.json`, mais sete arquivos de teste).

⚠️ Esta linha dizia `b506ba2d5` até a Fase 4. Aquele hash é o commit antes do rebase em
`origin/staging` e **não está mais na branch** (`git merge-base --is-ancestor b506ba2d5 HEAD` falha);
o commit equivalente, com a mesma árvore e o mesmo assunto, é `81c135f51`. Hash anotado antes de
publicar envelhece no primeiro rebase — conferir contra `git log` da branch antes de registrar.

## Fase 4

### A fase estava mal medida — T4.3a, T4.3b e T4.3c

As T4.2 e T4.3 foram escritas como se a API já servisse hora de captura, distância e veredito. Não
servia: `DeliveryProofView` publicava só `createdAt`, `downloadUrl`, `kind`, `lateRegistration`,
`receiverDocument`, `receiverName`, `receivedBy`, `receivedByDetail` e `thumbnailUrl`. As colunas
existem em `trip_delivery_proofs` desde a spec 159/ADR-0070 — o que faltava era publicá-las. Três
tasks novas abertas em 30/09/2026 fecham o buraco, e a fatia de API entrou **antes** da tela.

**A referência do raio não é o pino da parada.** A primeira redação da T4.3b mandava medir contra a
posição da parada. `delivery-proof-punctuality.policy.ts` mede contra a posição do **evento de
entrega** (`trip_stop_events.latitude/longitude`), campo `deliveryEventPosition`, emenda 2026-09-25
da ADR-0070 §4: "a foto prova o lugar da entrega registrada". Medir de outro ponto faria o número na
tela discordar do veredito já gravado na mesma linha. A task foi corrigida antes de implementar.

**A coordenada não sai do servidor.** `DeliveryProofRecord` e `DeliveryProofView` não carregam
`latitude`, `longitude` nem `accuracyMeters` — só `distanceMeters`, já arredondado em metros
inteiros pela haversine que já existia (`src/addresses/domain/coordinate-distance.ts`). Sem posição
dos dois lados, a distância é omitida do corpo; distância `0` é preservada (é medição, não ausência).

`bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts`
→ **239 pass · 0 fail** · EXIT=0.
Suíte de contrato inteiro da API: **8339 pass · 23 skip · 0 fail · 190 arquivos**.
`bun run typecheck` na raiz: limpo nos 7 pacotes.

### T4.1, T4.2, T4.3, T4.4, T4.5 — o painel

`bun test ./test/trip.contract.test.ts` em `apps/frontend-transportada`
→ **1928 pass · 0 fail** · EXIT=0. Referência antes da spec: 1915. Os 13 a mais são os contratos
das três leituras novas.

A lista de chaves aceitas é fechada: `isDeliveryProof` usa `hasKeys` com
`DELIVERY_PROOF_OPTIONAL_KEYS`, e `deliveryProofsFromApi` **descarta o item em silêncio** quando a
validação falha — 200 no fio e nada no console. Por isso a T4.3c entrou antes da T4.4: sem as três
chaves na lista, todo comprovante que as carregasse sumiria da tela. A T3.7 já tinha sido mordida
por esse mesmo mecanismo.

As leituras ficaram em `ProofReadings.component.tsx`, componente próprio, e não dentro do
hospedeiro: `TripDeliveryProof.component.tsx` já tinha 251 linhas antes da spec 220, acima do teto
de 200 do `code-standart.md` §9. A extração devolveu o arquivo a 247 linhas — abaixo de onde estava,
ainda acima do teto. Chegar a 200 exige extrair também `TripDeliveryProofDetail` e
`TripDocumentProducts`, código anterior à spec, fora do escopo desta fase. Fica anotado.
`METERS_PER_KILOMETER` é constante nomeada (§16): o contrato exige a constante, não o literal.

### T4.6 — revisão de design contra a página real

Não havia comprovante nenhum no banco local, então a revisão não tinha o que revisar. Os três
comprovantes foram semeados **pelo caminho real do servidor** — `field-delivery` do escritório uma
vez e `field-proof` duas — com miniatura gerada no cliente, de modo que o código da T3.4 rodou de
verdade. Viagem `fe7f0dbd`, nota 879795/2, documento `536cc86e`.

O canal do escritório não grava posição nem hora de captura, então três `UPDATE` no Postgres local
deram metadado distinguível a cada linha, para cobrir os três ramos de render:

| Comprovante | `capturedAt` | `distanceMeters` | `punctuality`   | `lateRegistration` |
| ----------- | ------------ | ---------------- | --------------- | ------------------ |
| canhoto     | −3 min       | 320              | `on_time`       | `false`            |
| mercadoria  | −2 h         | 1199             | `late_and_away` | `true`             |
| mercadoria  | ausente      | ausente          | `not_required`  | `false`            |

`GET /trips/:id/documents/:documentId/proof` devolveu 200 com exatamente esses três ramos, e
`latitude`/`longitude` **nulos nos três** — a regra de LGPD vale no fio, não só no componente.

Na tela (`/trips/fe7f0dbd-…`, aba "Comprovante" da nota 879795/2), o bloco rendeu:

```
Comprovante da entrega
Entregue em 30/09/2026, 09:24 · Recebido por Marcos Portaria
Capturada em 30/09/2026, 09:21 · a 320 m do ponto · NO HORÁRIO · Recebido por: Porteiro
Fotos da carga
Capturada em 30/09/2026, 07:25 · a 1,2 km do ponto · ATRASADA E LONGE DO PONTO · REGISTRADO DEPOIS
sem localização
```

Varredura de LGPD no DOM: nenhum `href`/`src` com coordenada, com `lat`/`lng` ou com URL de mapa, e
nenhum número de aparência de coordenada no texto do bloco. (O único `\d+\.\d{4,}` da página é
"32.1405 litros" do cálculo de combustível, fora do comprovante.)

**Três defeitos de design encontrados e corrigidos:**

1. Os três selos saíam com a mesma variante `ui-badge-default`, fundo `rgb(163, 89, 31)`. "No
   horário" ficava com a cor de "Atrasada e longe do ponto" — a cor não dizia nada, só o texto.
2. Dois selos na mesma linha se encostavam: "Atrasada e longe do ponto" terminava em x=439 e
   "Registrado depois" começava em x=439, `margin: 0px`, pai `display: block`. Lia-se um borrão só.
3. **Trocar para a variante semântica destapou um defeito do design system**, e ele não é da spec
   220: o selo pintava o texto com o mesmo acento que dilui no fundo. Medido sobre os tokens
   declarados, com o fundo translúcido composto sobre a superfície:

   | tema   | variante  | sobre a página | sobre o diálogo |
   | ------ | --------- | -------------- | --------------- |
   | claro  | `success` | **3,69**       | **4,00**        |
   | claro  | `warning` | **3,93**       | **4,26**        |
   | claro  | `info`    | **4,15**       | 4,52            |
   | escuro | `success` | 4,91           | **4,41**        |
   | escuro | `warning` | 4,96           | **4,41**        |

   Sete pares abaixo do piso de 4,5:1 do WCAG AA a 0,6875rem (11 px, peso normal). O tema escuro
   passava quase todo, que é por que ninguém tinha visto: é o tema que se olha no dia a dia.
   `variant="success"`/`variant="warning"` já estavam em uso em outras cinco telas
   (`ContractorContactsPanel:318,336`, `AggregateApplicationsTab:163`, `AggregateDocumentsTab:252`,
   `AddressReportPanel:343`), então o defeito era repo inteiro, não desta tela.

   Corrigido em **commit próprio** (`3a6e036e7`), fora da Fase 4, porque muda o design system: a
   tinta virou token por tema (`--color-ready-ink`, `--color-copper-ink`, `--color-slate-ink`), o
   fundo não mudou, e o contrato novo `test/design-system/badge-contrast.contract.ts` varre as
   variantes direto do CSS, compõe o fundo sobre as duas superfícies nos dois temas e mede. Visto
   reprovar antes (as sete linhas acima, uma a uma) e passar depois. Medido de novo na própria
   página, com o composto real: claro 4,97 / 4,97 / 5,04 e escuro 4,68 / 4,66 / 5,89.

   ⚠️ A primeira medição feita no navegador deu 3,68 / 3,92 / 4,83 por sorte: o script lia
   `color(srgb 0.98 0.97 0.96 / 0.82)` com o mesmo `[\d.]+` que lê `rgb(242, 239, 233)` e tratava
   `0.98` como se fosse 0–255. O número batia com o do modelo por coincidência de direção. Quem for
   medir contraste na página de novo: `color()` vem em 0–1, `rgb()` em 0–255, e o pai translúcido
   tem que ser composto camada por camada até uma superfície opaca.

⚠️ **As fotos não carregam neste navegador, e não é defeito do código.** Os objetos estão íntegros
no MinIO (originais de 21–25 KB, miniaturas de 3,5–4,2 KB, `image/jpeg`, `status = final`) e
`curl http://localhost:59000/minio/health/live` da máquina responde 200, mas o Chrome não alcança a
porta 59000 nem em `no-cors` — falha de rede antes de qualquer HTTP, inclusive no `/health`. Vale
igual para o `downloadUrl`, que é anterior à spec 220. É ambiente deste navegador, não a miniatura
da T3.4: o teste de integração da T3.8 já prova a gravação e a leitura contra o Postgres.

**T4.7 — `make check` na raiz do worktree: `EXIT=0`, 16838 testes passando e 0 falhando** (format:check

- lint + typecheck + test + build, monorepo inteiro). A miniatura ainda não é clicável e o
  `deliveryProof.open` do locale continua sem consumidor — os dois são a Fase 5.

## Fase 5

### T5.1 — a ordem e a navegação da galeria, provadas antes do diálogo

O teste desta app roda em `bun test` puro, **sem DOM**. Provar "as pontas param" e "com uma imagem só
não há botão" dentro do componente exigiria montagem, que aqui só existe em `test/trip-hooks/` (T5.5).
A decisão saiu então para função pura, e o diálogo passa a apenas obedecê-la — o que é a razão de a
regra ser testável cedo, e não um contorno da falta de DOM.

`src/modules/trip/shared/deliveryProofGallery.service.ts`:

- `buildDeliveryProofGallery(view)` — concatena `photos` (canhoto) → `cargoPhotos` (mercadoria) →
  `signatures`, cada grupo na ordem em que a tela o mostra, e **descarta o comprovante sem imagem**
  (`downloadUrl !== ''`). O filtro é seguro por tipo: `tripResponse.validation.ts:1231` valida
  `isString(value.downloadUrl)`, então o campo é string obrigatória, não opcional.
- `resolveDeliveryProofGalleryStartIndex({ gallery, proofId })` — o índice da imagem clicada, 0 quando
  não acha.
- `resolveDeliveryProofGalleryNavigation({ count, currentIndex })` — `{ canGoNext, canGoPrevious,
hasNavigation, nextIndex, previousIndex }`. **Não dá a volta**: na primeira, `previousIndex` é a
  própria; na última, `nextIndex` é a própria.

Contrato em `test/trip/delivery-proof-gallery.contract.ts`, importado por `test/trip.contract.test.ts`
(a lista de teste desta app é explícita — arquivo fora dela não roda). Sete asserções, uma por regra
nomeada na task.

- **Vermelho antes**: `Cannot find module '../../src/modules/trip/shared/deliveryProofGallery.service'`.
- **Verde depois**: a suíte de viagem (`test/trip.contract.test.ts`) — **1938 passando, 0 falhando**
  (eram 1931 antes; os 7 novos são exatamente estes).
- `bun run typecheck` na raiz: limpo nas 7 apps.

⚠️ **Não meça esta app com `bun test` puro.** A descoberta padrão do Bun varre também
`test/trip-hooks/` (que só passa por `bun run test:hooks`) e os arquivos do Playwright (runner
próprio): dá 28 falhas e 20 erros de `Playwright Test did not expect …` que não são defeito nenhum.
O comando é `bun run test`, cuja lista de arquivos é explícita no `package.json` — mesmo defeito de
forma que o aviso do `CLAUDE.md` já registra para a API, com outro par de comandos.

### T5.2 — o visualizador em tela cheia

`src/modules/trip/components/ProofGalleryDialog.component.tsx`, copiado do
`ProofImageLightbox` do app do motorista (**copiado, não importado** — nenhuma app importa
código-fonte de outra) sobre o `useModalDialog` do painel:

- Foco preso, Esc e devolução de foco vêm do `useModalDialog`; o diálogo não reescreve nenhum deles.
- O botão voltar do Android dispara `popstate`, que fecharia a tela inteira: uma entrada de histórico
  reservada (`{ proofGalleryDialog: true }`, lida com type guard, sem `as`) absorve o gesto, e a
  limpeza só desempilha se a marca ainda estiver lá.
- Anterior e próxima saem de `resolveDeliveryProofGalleryNavigation` — o diálogo **obedece** a função
  da T5.1 em vez de recalcular ponta, e o botão da ponta fica `disabled`. Com uma imagem só,
  `hasNavigation` esconde setas e contador. As setas ← e → do teclado respeitam os mesmos limites.
- A imagem é sempre `proof.downloadUrl`, o original.
- `z-index: 80` é o maior da app (o seguinte é 70), então a galeria fica acima de qualquer overlay.
- Contraste do contador medido com o mesmo helper da Fase 4: `--color-fog` sobre o fundo composto
  (`asphalt` a 92 %) dá **14,48:1** no escuro e **12,66:1** no claro, contra o piso de 4,5.

**Um defeito corrigido na revisão**: o diálogo nascera com um `alt` genérico próprio
(`galleryImageAlt` = "Comprovante {{position}} de {{count}}"), que joga fora exatamente a distinção
canhoto ≠ mercadoria que é a razão desta spec existir — e o painel já tinha `photoAlt`,
`cargoPhotoAlt` e `signatureAlt` por tipo. O `alt` passou a sair de `ALT_KEY_BY_KIND[proof.kind]`
(`satisfies Record<DeliveryProofKind, string>`, então tipo novo de comprovante quebra o typecheck em
vez de cair num rótulo errado) e a chave inventada saiu dos dois locales. Posição e total continuam
no contador, que é onde essa informação serve.

Chaves novas em `deliveryProof`, nas duas línguas: `galleryClose`, `galleryCounter`, `galleryLabel`,
`galleryNext`, `galleryPrevious`.

- `bun run typecheck` (raiz): limpo nas 7 apps. `bun run lint` (raiz): `EXIT=0`.
- `bun run test` em `apps/frontend-transportada`: **5811 passando / 0 falhando** nos contratos (31
  arquivos) e **61 passando / 0 falhando** nos hooks.

### T5.3 e T5.4 — a miniatura abre o original, e a chave órfã ganha dono

A miniatura virou **`<button type="button">` de verdade** (não `div` com `onClick`, não
`role="button"`): alcançável por teclado, com `:focus-visible` visível, e `aria-label` =
`t('deliveryProof.open')` — a chave "Abrir em tamanho real" / "Open in full size" que existia nos dois
locales **sem nenhum consumidor**. É a T5.4 inteira: a chave ficou porque ganhou o dono certo.

- A galeria sai de `buildDeliveryProofGallery(view)` e o índice de
  `resolveDeliveryProofGalleryStartIndex` — a tela não remonta lista nem procura índice à mão.
- Comprovante sem imagem não vira botão (`canOpen`): ele não está na galeria, então um botão que o
  "abrisse" abriria outra coisa.
- A tela cheia usa `proof.downloadUrl`. `resolveDeliveryProofImageSource` é só da miniatura e não
  chega ao diálogo, porque o diálogo não recebe fonte de imagem nenhuma.
- `TripDeliveryProofDetail` saiu para arquivo próprio: o componente estava em 247 linhas e esta task
  o aumentaria. Ficou em 206 — **ainda 6 acima do teto de 200**, e o que falta é separar `ProofImage`,
  que é código anterior a esta spec.

**Um defeito corrigido na revisão.** O contrato `delivery-proof-panel.contract.ts` guarda uma regra
real: a URL assinada expira em cinco minutos, então não pode ser copiada para dentro de um `useState`
— tela que a guarda e reusa mostra imagem quebrada sem dizer por quê. A guarda estava escrita como
`expect(source).not.toInclude('useState<string')`, e a task nasceu com um `type OpenProofId = string
| null` cuja **única razão de existir era escapar desse texto**. O comportamento estava certo (o que
entra no estado é o `id`, não a URL), mas um contrato que se contorna com um `type` não guarda nada,
e o próximo a guardar a URL sob outro apelido passaria igual.

O apelido saiu (`useState<string | null>`) e a guarda passou a mirar a URL em vez do tipo `string`:

```ts
const HELD_URL_IN_STATE = /useState\b[^\n]*[Uu]rl/
const URL_INTO_SETTER = /set[A-Z]\w*\([^)]*downloadUrl/
```

A redação anterior errava dos dois lados — reprovava estado legítimo de `string` e deixava passar a
URL sob apelido. Um teste novo planta as três formas de esconder a URL no estado e exige que a guarda
morda cada uma, além de exigir que ela **não** morda o estado legítimo do id.

`delivery-proof-disclosure.contract.ts` também mudou, e não foi afrouxamento: ele lê fonte como
texto, e a extração levou as duas expansões para outro arquivo. As asserções são as mesmas; só o que
ele lê passou a acompanhar o código que se mudou.

- `bun run typecheck` (raiz): `EXIT=0`. `bun run lint` (raiz): `EXIT=0`.
- `bun run test` em `apps/frontend-transportada`: **5812 passando / 0 falhando** nos contratos e
  **61 passando / 0 falhando** nos hooks. O contrato a mais é o da guarda plantada.

### T5.5 — O diálogo deixa de ser promessa do código e vira prova

Até aqui, foco preso, Esc e `popstate` estavam **escritos** no `ProofGalleryDialog` e conferidos por
contrato de texto — que prova que a linha existe, não que ela funciona. `test/trip-hooks/proof-gallery-dialog.contract.ts`
monta o `TripDeliveryProof` de verdade, com um canhoto, uma foto de mercadoria e uma assinatura, e
consulta a tela por `aria-label` e `role` — nunca por classe de CSS, que muda sem que nada quebre.

Onze testes:

| #   | O que prova                                                                         |
| --- | ----------------------------------------------------------------------------------- |
| 1   | clicar na miniatura abre o diálogo com o **original**, não com a fonte da miniatura |
| 2   | o diálogo é irmão do container em `document.body`, com `role` e `aria-modal`        |
| 3   | Esc fecha                                                                           |
| 4   | o foco vai para dentro do diálogo ao abrir                                          |
| 5   | próxima e anterior trocam a imagem, e o botão da ponta fica `disabled`              |
| 6   | com uma imagem só, não há próxima, anterior nem contador                            |
| 7   | o contador anuncia a posição quando há mais de uma                                  |
| 8   | `popstate` (o voltar do Android) fecha o diálogo em vez de sair da tela             |
| 9   | abrir empilha uma entrada de histórico, fechar a desempilha                         |
| 10  | o `alt` do diálogo distingue canhoto, mercadoria e assinatura                       |
| 11  | comprovante sem original não oferece botão para abrir                               |

O primeiro é o que a T5.3 prometia e nenhum contrato de texto conseguia cobrar: a fixture dá ao
canhoto uma miniatura em `https://storage.test/thumb/receipt-1` **diferente** do original em
`https://storage.test/original/receipt-1`, e o teste exige que a tela cheia mostre o segundo e
`not.toContain('thumb')`. Miniatura ampliada e original só se distinguem quando as duas URLs diferem.

**Dois limites, ditos na cara.** O `history.back` é dublê contado dentro do `describe` — o teste 9
prova que o componente **chama** o desempilhamento uma vez, não que o `history.back()` do navegador
faça o que se espera dele. E os hooks deste arquivo ficam **dentro** do `describe`, não no topo: o
`field-delivery-focus.contract.ts` vizinho tem um `afterEach` de topo que zera o `document.body` de
todo teste do processo, e o portal do diálogo morre com `removeChild` se essa limpeza vier antes da
desmontagem do React. Quem escrever o próximo teste de portal nesta suíte bate nisso.

- `bun run test:hooks` em `apps/frontend-transportada`: **72 passando / 0 falhando**, 264 `expect()`
  (eram 61). `bun run test`: **5812 passando / 0 falhando**, inalterado — nenhum código de produção
  foi tocado nesta task.
- A suíte imprime 124 avisos `not wrapped in act` do React. Medido com e sem o arquivo novo (stash do
  `trip-hooks.contract.test.ts`): **124 dos dois lados** — são anteriores a esta spec, e os onze
  testes novos não acrescentam nenhum.

### T5.8 — A imagem avisa que está a caminho

Task acrescentada a pedido do usuário no meio da fase ("precisa dos skeletons tbm"). A imagem do
comprovante vem por URL assinada, sobre a rede do galpão: entre o render e o pixel havia um buraco
branco do tamanho da miniatura, e nada dizia que algo estava a caminho.

Contrato antes da implementação, em `test/trip-hooks/proof-image-skeleton.contract.ts`, sete testes,
vermelho nas asserções das linhas 123, 152 e 174 antes de qualquer código de produção:

| #   | o que o teste cobra                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | a miniatura nasce com marcador **e com a imagem junto** — sem `<img>` no DOM desde o início, o `load` nunca chega |
| 2   | o marcador sai quando a imagem carrega                                                                            |
| 3   | imagem que **falha** também tira o marcador — nada fica girando para sempre                                       |
| 4   | três comprovantes, três marcadores; um que chega não apaga o aviso dos outros                                     |
| 5   | comprovante sem imagem nenhuma (`downloadUrl` vazio) não ganha marcador                                           |
| 6   | a galeria em tamanho real avisa enquanto o **original** não chega                                                 |
| 7   | avançar na galeria traz o marcador de volta para o comprovante seguinte                                           |

O 3 é a decisão de projeto que o teste trava: um marcador que gira para sempre mente mais do que o
buraco branco que veio substituir. O 5 apareceu por causa do 3 — foi o teste vermelho que revelou o
caso do comprovante sem fonte, cujo marcador esperaria um evento que nunca chega. O 7 é por que o
diálogo guarda o **id** do comprovante resolvido, e não um booleano.

Reuso do `Skeleton`/`SkeletonGroup` do design system, com `role="status"`, `aria-busy` e o ramo de
`prefers-reduced-motion` que ele já tinha — nada de um terceiro jeito de dizer "carregando". As
asserções são de comportamento (`role="status"` + rótulo), nunca de classe de CSS module: classe não
sobrevive ao ambiente de teste e cobraria a forma em vez do efeito.

**Três medições que mudaram o código, em vez de virarem palpite:**

1. O `happy-dom` devolve `HTMLImageElement.complete === true` **mesmo antes de existir `src`**
   (medido: `{"antesDoSrc":{"complete":true,"naturalWidth":0}}`). A guarda de "imagem já em cache"
   que eu havia escrito era quebrada no teste e errada em princípio — pela especificação do HTML,
   `complete` é verdadeiro para imagem de `src` vazio. Ela saiu dos dois componentes: em CSR o React
   liga o `onLoad` no mesmo commit em que define o `src`, e o evento chega depois.
2. `TS18048` no diálogo: o TypeScript não leva o estreitamento de `const` para dentro de `function`
   declarada (leva para arrow). Resolvido com `const currentProofId = proof.id` antes da declaração.
3. `TripDeliveryProof.component.tsx` passou de 205 linhas — acima do teto de 200. A extração do
   `ProofImage` para arquivo próprio resolveu as duas coisas de uma vez.

**Uma guarda foi reforçada, não afrouxada.** Ao mover a miniatura para arquivo próprio, quebrou o
`delivery-proof-panel.contract.ts:70`, que exigia `resolveDeliveryProofImageSource(proof)` dentro do
painel. A correção não foi relaxar a asserção: a guarda passou a ler a **união** dos três arquivos
onde a URL assinada agora vive (painel, `ProofImage`, `ProofGalleryDialog`) — e o diálogo, criado na
T5.4, nunca estivera coberto por ela até aqui.

- `bun run typecheck`: limpo. `bun run test`: **5812 passando / 0 falhando**.
- `bun run test:hooks`: **81 passando / 0 falhando** (74 antes, 7 novos).
- `bun run format:check` (raiz) e `bun run lint`: saída 0. Os 16 avisos do lint são todos de arquivos
  anteriores a esta task; nenhum nos novos.

### T5.6 — Revisão de design contra a página real (`web.md` §15)

Feita na página de verdade (`localhost:53112`, viagem `fe7f0dbd`), com um `MutationObserver`
instalado **antes** de abrir a aba "Comprovante" — o marcador é estado transitório e some antes de
qualquer leitura feita depois.

**O que a página confirmou:**

- A distinção que a spec inteira existe para fazer está na tela e na árvore de acessibilidade: um
  `Foto do comprovante de entrega` e dois `Foto da mercadoria entregue`, sob a seção própria
  "Fotos da carga", dentro de "Comprovante da entrega".
- **Três marcadores aparecem, um por comprovante**, e todos saem. Medido três vezes seguidas, com o
  contador do observador zerado antes de cada abertura: `observados: 3`, `marcadoresRestantes: 0`.
- Eles saíram pelo `onError` — e é justamente o teste 3 exercitado na página real: a imagem falhou e
  **nada ficou girando**. O caminho de falha, que costuma ser o que ninguém vê antes de produção,
  foi o que este ambiente entregou de graça.
- Tema: `data-theme` alterna `light`/`dark` pelo controle do app. A classe `dark` que fica no
  `<html>` nos dois estados é **inerte** — nenhuma regra CSS do app a usa (`grep` em `src/**/*.css`
  sem ocorrência) e o app só escreve `data-theme`. Isso encerra a dúvida levantada na Fase 1: a
  medição de contraste feita pelo controle do próprio app continua valendo (11,93:1 e 11,55:1 no
  escuro; 12,79:1 e 11,45:1 no claro — ambos passam AA).

**O que não foi possível medir, dito na cara:**

- **Os 375/768/1280 px reais.** O `resize_window` relata sucesso e o `innerWidth` continua 1512;
  popup dimensionado por `window.open` é bloqueado. A janela medida foi 1512×776. O comportamento
  responsivo desta fase não tem prova visual.
- **A imagem do comprovante não renderiza neste ambiente local.** Todo `GetObject` assinado no MinIO
  volta **503** para o navegador, enquanto o mesmo MinIO responde 200 em `/minio/health/{live,ready,
cluster}` pelo shell, sem erro no log e sem reinício em dois dias. A URL não estava expirada
  (assinada 35 s antes, validade 300 s). A página é PWA e está sob um service worker de
  desenvolvimento (`dev-sw.js`, `devOptions.enabled`), que é o suspeito: nenhuma das três regras de
  `runtimeCaching` do `vite.config.ts` casa com a URL do MinIO, e `navigateFallback` só vale para
  navegação — então **em produção o service worker não interceptaria essa imagem**. Não consegui
  isolar: ao desregistrar o SW e recarregar, ele se re-registra e reassume a página no mesmo load.
  Fica como pendência de ambiente, fora do escopo da 220, e **não** como defeito conhecido de
  produção.
- **O print saiu em branco.** O painel estava medido e enquadrado (729 px de altura, topo em 90 px,
  tema claro coerente), e a captura devolveu só a cor de fundo. Terceira anomalia de renderização
  deste navegador na mesma sessão, depois das `data:` URI e do 503. Parei a investigação aqui em vez
  de insistir: o arquivo capturado é `screenshot-1790778262382-5.jpg`.

**Correção de uma conclusão minha anterior.** Eu havia afirmado que este navegador não alcançava
imagem nenhuma. Está errado: a medição seguinte mostrou duas imagens da própria aplicação carregadas
(`naturalWidth` 150 e 96, zero quebradas). O que falha é especificamente o objeto assinado do MinIO,
pelo caminho descrito acima.

### T5.7 — O portão da fase

`make check` na raiz do worktree, duas passadas.

**A primeira reprovou**, e vale registrar em quê: `format:check` sobre o próprio `evidence.md` deste
diretório. Nenhum dos gates que eu já havia rodado pegaria isso — o `check` de cada app é eslint
sobre `src` e `test`, e o prettier só existe na raiz, varrendo o repositório inteiro, `specs/`
incluído. Documento de evidência é código para efeito de formatação. `bunx prettier --write` no
arquivo e nada mais.

**A segunda passou**: `EXIT=0`, e uma varredura por `error:`, `FAIL` e `Error 1` no log de 1416
linhas devolve zero ocorrências.

| Etapa          | Resultado                              |
| -------------- | -------------------------------------- |
| `format:check` | 0                                      |
| `lint`         | 0 (16 avisos, todos preexistentes)     |
| `typecheck`    | 0                                      |
| `test`         | 5812 contratos + 81 de hooks, 0 falhas |
| `build`        | 0                                      |

⚠️ **O código de saída do shell de fundo não é o do portão.** Na primeira passada o shell devolveu 0
porque o comando terminava em `echo EXIT=$?`, e o `echo` é quem definiu o código do shell — a
notificação disse "exit code 0" sobre um `make` que havia falhado. Quem lê o resultado lê a linha
`EXIT=` dentro do log, nunca o status do shell que o produziu.

Commit isolado da fase fecha T5.1–T5.8 — `0eb747b11`.

### Achado fora de escopo — o mesmo defeito no app do motorista

`ProofImageLightbox.component.tsx` do `frontend-driver` é cópia por valor do diálogo do painel, e
carregava o defeito idêntico ao que a T5.4 corrigiu aqui: efeito do histórico com dependência
`[onClose]` e `history.back()` síncrono na limpeza. Sob `StrictMode`, o `popstate` chega depois da
remontagem e fecha o diálogo no mesmo toque que o abriu.

É da spec 189, não da 220. **Decisão do usuário: corrigir agora, em commit à parte.** Mesma forma da
correção do painel — `onCloseRef`, desfazer adiado por uma tarefa e cancelado pela remontagem, e a
chave do marcador extraída para constante, já que passou a aparecer duas vezes.

⚠️ **O contrato aqui é de forma, não de comportamento, e a diferença importa.** O `frontend-driver`
não monta React em teste: não tem `@happy-dom/global-registrator` nem preload de DOM, e seus 752
contratos são asserções sobre texto-fonte ou função pura. Montar React nesta app seria infraestrutura
nova — dependência, preload e script — para um teste só, e não é o que o usuário pediu. A prova
comportamental existe: vive na suíte montada do painel, sobre código idêntico.

O caminho até a asserção certa teve dois erros meus, ambos corrigidos por medição e não por
suposição:

1. `not.toContain('}, [onClose])')` reprovava a própria correção, porque o efeito **legítimo** que
   sincroniza a ref também termina assim.
2. Recortar o efeito até `'return ('` recortava no `return () => {` da limpeza — `return () =>`
   começa com `return (`. A âncora passou a ser `'\n  return ('`, o `return` do JSX, com indentação.

Vermelho antes de verde, verificado **contra o código antigo de verdade** (`git stash` do
componente, sem a correção): 751 passam, 1 falha. Com a correção de volta: **752 passam, 0 falham**,
`typecheck` limpo e `eslint` sem aviso.

## Fase 6

### T6.1 — Quantos canhotos já existem, e o que fazer com eles

**A contagem que a task pede é de produção, e eu não tenho acesso a produção daqui.** O que a base
local respondeu, para não passar por medição o que não é:

```
 kind  | total |            oldest             |            newest
-------+-------+-------------------------------+-------------------------------
 cargo |     2 | 2026-09-30 12:25:08.082836+00 | 2026-09-30 12:25:10.210026+00
 photo |     1 | 2026-09-30 12:24:57.112758+00 | 2026-09-30 12:24:57.112758+00
```

Três comprovantes, **nenhum** deles `signature`, e os três semeados por mim hoje durante a T5.6.
A base local não sabe nada sobre o volume real: ela não é amostra de produção, é rascunho meu.

**Decisão do usuário: nenhum preenchimento retroativo.** Canhoto anterior ao deploy fica sem
veredito, e a fila de conferência nasce vazia.

⚠️ **Isto altera a RF24**, que dizia "comprovante existente entra como `not_applicable`; canhoto
existente entra como `pending`". A segunda metade cai. O que fica: `not_applicable` é o padrão da
coluna para **toda** linha existente, canhoto incluído — e o valor é honesto para elas, porque
conferência de fato não se aplicava a um canhoto capturado antes de a conferência existir.
`pending` passa a significar uma coisa só, sem ambiguidade: alguém precisa olhar isto agora.

O raciocínio por trás da escolha, para quem ler depois: era o único caminho que não dependia de
saber o volume de produção — que ninguém aqui sabia — e o único que não estreia a funcionalidade
despejando na tela uma fila do tamanho de todo o histórico de entregas, que ninguém iria conferir.
Fila que nasce cheia de trabalho morto ensina a equipe a ignorar a fila.

#### A contagem de produção existia, e estava a uma spec de distância

Escrito o parágrafo acima, achei a medição procurando outra coisa (a guarda de texto livre da T6.7).
A `evidence.md` da spec 162 traz uma consulta de leitura **em produção**, de 2026-09-21 — nove dias
atrás —, sobre o bucket inteiro: 3.794 objetos, 51 MB, e a frase que responde esta task,

> "Não existe em produção nenhum objeto de `delivery_proof` […]"

com o porquê logo em seguida: `company_occurrence_types` estava vazia desde 03/09, então nunca houve
ocorrência para anexar foto.

Ou seja: **o conjunto a preencher retroativamente é vazio.** "Nenhum retroativo" deixa de ser uma
escolha entre dois riscos e passa a ser a única leitura coerente com o fato — e a segunda metade da
RF24 não muda o comportamento de nenhuma linha, porque não há linha. A decisão do usuário fica de
pé, agora com medição por trás em vez de argumento.

⚠️ A lição de método, que vale mais que o número: eu declarei "indisponível daqui" depois de olhar
só a base local. A medição de produção estava versionada, em `specs/162-limpeza-do-armazenamento/evidence.md`,
e o `CLAUDE.md` deste repositório manda começar spec nova lendo as specs do mesmo assunto
justamente por isso. Ausência de acesso não é ausência de dado: o dado pode já estar escrito.

### Achado de preparação da T6.7 — a guarda a reusar não existe, e o número 162 é ambíguo

A T6.7 manda **reusar** a guarda de texto livre da spec 162 RF11, "mesma função", e não escrever
outra. Fui buscá-la antes de começar. Duas coisas apareceram.

**Primeira: há duas specs 162 neste repositório.**

```
$ ls specs/ | grep -i "^162"
162-importar-medidas-de-caixa-coletadas/
162-limpeza-do-armazenamento/
```

O código só cita uma — os oito `Spec 162` em `src/` são todos do importador de caixas. A que a spec
220 cita é a outra, `162-limpeza-do-armazenamento`, e é dela a RF11 sobre canhoto ilegível. Procurar
"spec 162" no código, que foi o meu primeiro reflexo, leva à spec errada com toda a confiança do
mundo.

**Segunda: a guarda não foi implementada.** A 162 parou no portão de decisão da própria T0 — a
`evidence.md` dela conclui que o universo apagável eram "6 PDFs de fatura, 450 kB" e que dezenove
tasks não se pagavam. De `src/storage/` existem dois arquivos, o gateway e o repositório:

```
$ find src/storage -type f -name "*.ts"
src/storage/infrastructure/nfe-storage-gateway.ts
src/storage/infrastructure/drizzle-stored-object.repository.ts
```

Sem rota de expurgo, sem `purge-illegible`, sem validação de motivo. Não há o que reusar.

Consequência para a T6.7, anotada no `tasks.md`: a guarda **é escrita aqui**, mas em `src/shared/`,
não dentro do módulo de viagens — para que a 162 a importe quando for implementada, em vez de
nascer uma segunda. A instrução da task continua valendo no espírito (uma função só para as duas
specs); o que mudou é quem escreve primeiro.

### T6.3 — A migration do veredito (executada antes da T6.2, de propósito)

**A ordem do `tasks.md` está invertida aqui, e a inversão é deliberada.** A T6.2 é um teste de
integração, e o Postgres descartável da integração é construído **a partir das migrations**, não do
schema TypeScript — `withDisposableDatabase` chama `runDatabaseMigrations`
(`test/fixtures/trip-field-office-database.fixture.ts:528-530`). Escrever a T6.2 primeiro não daria
o vermelho de TDD: daria `column "canhoto_review" does not exist`, que é a fixture faltando, não o
comportamento faltando. Vermelho de TDD vem do comportamento que falta. A T6.3 não é "implementar a
T6.2 antes da hora" — é montar a fixture dela, e nenhuma linha de aplicação lê ou escreve as colunas
novas neste commit.

#### O que entrou

Dez colunas em `trip_delivery_proofs`, mais uma FK composta e dezesseis restrições:

| Coluna                                           | Para quê                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `canhoto_review`                                 | o veredito: `not_applicable` · `pending` · `approved` · `rejected` |
| `canhoto_review_origin`                          | quem decidiu: `automatic` ou `manual`                              |
| `canhoto_review_by_user_id`, `canhoto_review_at` | ator e instante da decisão humana                                  |
| `canhoto_review_reason`, `canhoto_review_note`   | motivo da recusa e o texto livre do `other`                        |
| `canhoto_read_number`, `canhoto_read_series`     | o número **impresso** na nota lida                                 |
| `canhoto_read_source`                            | como foi lido: `barcode` ou `ocr`                                  |
| `canhoto_read_document_id`                       | a nota da viagem que a leitura apontou                             |

#### Três decisões que o tipo não conta, e por isso estão escritas no schema

**1. `canhoto_read_number` é `varchar(9)`, e nunca a chave de acesso.** A chave da NF-e tem 44
dígitos e as posições 7-20 são o CNPJ do emitente — e produtor rural pessoa física põe o **CPF**
zerado à esquerda no mesmo campo. Guardar a chave aqui seria pôr documento de pessoa física numa
coluna que o painel devolve na tela, além de duplicar o que `nfe_documents.access_key` já tem. O que
se guarda é o número impresso mais a série, que `formatCanhotoOcrNumber` renderiza como `9000/1`; a
ligação com a nota é a FK composta. O teste estático cobre isto (`expect(migrationSql).not
.toContain('access_key')`), porque é o tipo de "conserto" que alguém faz de boa-fé mais tarde.

**2. `canhoto_review_origin` e `canhoto_read_source` são dois eixos, não um.** Um diz _quem decidiu_
(automático ou humano), o outro diz _como o número foi lido_ (código de barras ou OCR). Fundir os
dois quebra dois CHECKs: o ator só existe quando a origem é `manual`, e a aprovação automática só
existe quando a leitura veio de código de barras (RF26 — OCR nunca aprova sozinho).

**3. O `default` descreve o passado, não o presente.** `not_applicable` é o valor de fábrica que
cobre toda linha já existente (decisão da T6.1, com a medição de produção da spec 162 por trás). Um
canhoto **novo** nasce `pending`, e isso vai escrito à mão no `INSERT` da T6.2 — primeira coluna
desta tabela em que o `default` e o valor inserido divergem de propósito. Confiar no `default` para
o caminho novo deixaria a conferência inerte: a fila nunca receberia ninguém.

#### `is not distinct from`, não `=`

Dois CHECKs comparam uma coluna anulável contra um literal. Com `=`, uma origem `NULL` faz a
expressão valer `NULL`, e CHECK só reprova em `FALSE` — a linha incoerente passaria calada:

```sql
-- passaria com origem nula
("canhoto_review_by_user_id" is not null) = ("canhoto_review_origin" = 'manual')
-- o que entrou
("canhoto_review_by_user_id" is not null) = ("canhoto_review_origin" is not distinct from 'manual')
```

Os CHECKs irmãos da tabela já usam a forma `(x is null) = (y is null)` pela mesma razão.

#### Nenhuma restrição valida no comando que a cria

`ADD CONSTRAINT` validando toma `ACCESS EXCLUSIVE` e varre a tabela inteira; `VALIDATE CONSTRAINT`
depois toma só `SHARE UPDATE EXCLUSIVE`. São dezesseis restrições numa tabela que cresce a cada
entrega — basta uma esquecida para o ganho virar zero, e a esquecida **não aparece em nenhum teste
de banco**, porque o banco de teste está vazio e varrer o vazio é instantâneo. Só teste estático
alcança. Precedente: `20260930110332_delivery_proof_thumbnail/migration.sql:9-10`.

O teste novo em `static-migration.contract.ts` não confere as dezesseis à mão — extrai cada
`ADD CONSTRAINT` do arquivo e cobra de todas as duas coisas, o `NOT VALID` e o `VALIDATE` pareado.
Confirmado que ele reprova de verdade, tirando um `NOT VALID` de uma restrição:

```
$ bun --env-file=../../.env.test test test/database-migration.contract.test.ts
- []
+   "trip_delivery_proofs_canhoto_review_check",
(fail) versions the canhoto conference as an additive migration that never validates inline
 72 pass  1 fail
```

Restaurado o arquivo: **73 pass, 4 skip, 0 fail, 832 expect()**.

#### `make migration-test`

```
$ make migration-test
 113 pass
 0 fail
 1630 expect() calls
Ran 113 tests across 8 files. [54.16s]
EXIT=0
```

⚠️ **O `db:test` não executa `rollback.sql` nenhum** — ele confere a _forma_ do arquivo (chave
própria, `ROW_COUNT`, `BEGIN`/`COMMIT`) e aplica as migrations. É exatamente o buraco que custou
dois deploys vermelhos em 02/09 (comentário em `static-migration.contract.ts:377`). Então o rollback
foi executado à mão, num banco criado e destruído para isto:

```
$ createdb canhoto_rollback_probe && db:migrate      → EXIT=0
   colunas canhoto_* = 10 · restrições canhoto = 16, validadas = 16
$ psql -v ON_ERROR_STOP=1 -f rollback.sql
   BEGIN · ALTER TABLE ×3 · DO · COMMIT
   colunas restantes = 0 · restrições restantes = 0 · linha no journal = 0
$ db:migrate                                          → EXIT=0
   colunas = 10 · linha no journal = 1
$ dropdb canhoto_rollback_probe
```

A terceira linha é a que importa: como o rollback apaga a própria linha do journal, o `db:migrate`
seguinte **reaplica** a migration em vez de pulá-la. Rollback que deixa a linha para trás produz um
banco sem as colunas que o journal jura estarem lá, e nada avisa até a primeira escrita quebrar.

`bun run typecheck` → EXIT=0.

### T6.2 — Canhoto recapturado zera a conferência

O contrato veio antes: `test/trip-delivery-proof/canhoto-review-reset.contract.ts` (novo, entrou no
entrypoint `test/trip-delivery-proof.contract.test.ts`) e
`test/integration/delivery-proof-canhoto-review.integration.ts` (novo, entrou na lista explícita do
`package.json`). O vermelho foi o certo — comportamento faltando, não fixture faltando:

```
error: Cannot find module '../../src/trips/domain/canhoto-review.policy.js'
```

#### A condição que o plano pedia é código morto

O `architect` prescreveu um `CASE` no `DO UPDATE SET`: mesmo `attachmentKey` preserva o veredito,
`attachmentKey` diferente zera. **Medido: o mesmo `attachmentKey` nunca chega ao `ON CONFLICT`.** Os
dois canais de captura desviam antes de qualquer INSERT:

| Canal      | Arquivo                             | Linhas  | O que faz                                             |
| ---------- | ----------------------------------- | ------- | ----------------------------------------------------- |
| Motorista  | `attach-delivery-proof.use-case.ts` | 253–261 | `findProofIdByAttachmentKey` → devolve o id existente |
| Escritório | `office-delivery-proof.service.ts`  | 137–145 | `findProofIdByAttachmentKeyWithinTransaction` → idem  |

Toda escrita que alcança o `ON CONFLICT` é, portanto, **captura nova**. O zeramento é
incondicional, e a condição do plano seria um ramo que nenhum caso de uso consegue exercitar. Um
teste de integração dedicado prende essa medida: a repetição da mesma chave preserva o `rejected`
porque **não escreve**, não porque o `CASE` decidiu.

#### Os dois INSERT eram byte a byte iguais, menos uma coluna

`drizzle-delivery-proof.repository.ts` (motorista) e `drizzle-driver-field-report.repository.ts`
(escritório) tinham dois blocos `.values()` idênticos exceto `lateRegistration`. Essa duplicação é
exatamente o mecanismo pelo qual o canhoto do escritório nasceria **sem veredito**: quem escreve o
estado num lugar esquece no outro, e nada falha — o default `not_applicable` responde por ele e a
fila de conferência fica vazia para sempre.

Extraído `buildProofInsertValues(input)`, exportado do repositório do motorista e consumido pelo do
escritório com `{ ...input, lateRegistration: false }` (o escritório nunca registra depois, spec 205
D1 — antes ele omitia a coluna e caía no default `false`, o que é o mesmo valor).

O zeramento entra em dois pontos, de uma fonte só (`src/trips/domain/canhoto-review.policy.ts`):
`buildProofInsertValues` e o `base` de `buildProofUpsertSet`. **No `base`, nunca no ramo do
envelope** — o caminho do motorista quase sempre chega com `receiverDocumentEnvelope === null`, e o
zeramento pendurado no ramo do envelope não rodaria justamente para ele.

⚠️ O `DO UPDATE SET` desta tabela é **denotativo**: coluna ausente do objeto não é tocada e o valor
antigo sobrevive — escolha deliberada de `receiver_document_envelope` e `late_registration`. A
conferência é a **primeira** coluna cujo padrão correto na recaptura é _apagar_, e por isso as dez
entram juntas.

#### Contrato

```
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts --timeout 120000
 249 pass
 0 fail
 466 expect() calls
```

Uma das asserções é anti-vacuidade: `getTableColumns(tripDeliveryProofs)` filtrado por `canhoto`
tem de bater exatamente com as chaves de `buildCanhotoReviewReset`. Coluna nova da família entra no
zeramento ou o contrato cai.

#### Integração

```
$ bun --env-file=../../.env.test test ./test/integration/delivery-proof-canhoto-review.integration.ts
 4 pass
 0 fail
 8 expect() calls   [8.93s]
```

Os quatro: canhoto nasce `pending`; `cargo` e `signature` nascem `not_applicable`; recaptura volta a
`pending` com as nove colunas nulas e **o mesmo `id`**; repetição da mesma chave não alcança o
upsert e o `rejected` sobrevive.

#### O teste não é vazio — provado por mutação

Removida a linha `...buildCanhotoReviewReset(input.kind)` do `base` de `buildProofUpsertSet`:

```
 249 pass  4 fail
  (fail) canhoto recapturado zera a conferência: volta a pendente e não herda o recusado
  (fail) a recaptura zera a conferência no ON CONFLICT > ... (3 contratos)
```

Restaurado do backup; `grep -c buildCanhotoReviewReset` volta a **3** ocorrências no arquivo
(import + INSERT + `base`).

#### Portões

```
$ bun run typecheck                                   → EXIT=0
$ bun --env-file=../../.env.test test --timeout 120000
 8350 pass · 23 skip · 0 fail · 27045 expect()  [34s]  → EXIT=0
$ bun --env-file=../../.env.test run test:integration
 774 pass · 7 skip · 1 fail · 4296 expect()
 Ran 782 tests across 143 files. [1184.48s]            → EXIT=1
$ bun run --cwd apps/api-transportada lint             → sem achados
$ bunx prettier --check (7 arquivos tocados)           → limpo
```

#### A falha da suíte cheia é de relógio, não de canhoto

```
test/integration/trip-occurrence-correction.integration.ts:
(fail) correção de itens da ocorrência (spec 167 T301/T309) >
       grava o conjunto anterior e passa a valer o novo (CA02) [5019.30ms]
  ^ this test timed out after 5000ms.
```

Estourou o prazo **padrão** do Bun por 19 ms, depois de 1184 s de suíte com dois servidores de
desenvolvimento no ar. O arquivo sozinho:

```
$ bun --env-file=../../.env.test test ./test/integration/trip-occurrence-correction.integration.ts
 7 pass · 0 fail · 14 expect()  [14.45s]               → EXIT=0
```

Não toca comprovante, canhoto nem nenhuma coluna desta spec — é a spec 167, correção de itens de
ocorrência. O defeito real é o teste não declarar prazo próprio e viver a 19 ms do teto: fica
registrado aqui como pendência fora da 220, não como verde.

`make migration-test` não se aplica: a T6.2 não mexe em schema — a migration é a T6.3, já fechada.

### T6.4 + T6.5 — O veredito automático do canhoto

Contrato antes: `test/trip/canhoto-review.contract.ts` (novo, registrado no entrypoint
`test/trip.contract.test.ts` — o `package.json` do painel já lista o entrypoint, então nenhum
arquivo novo entra na lista). O vermelho foi comportamento faltando, não fixture:

```
error: Cannot find module '@/modules/trip/shared/canhotoReview.service'
       from '.../test/trip/canhoto-review.contract.ts'
```

As duas tasks fecharam no mesmo commit: o vermelho fica aqui, não na árvore — commit vermelho
quebra o portão de quem vier depois.

#### As CHECK do banco viraram asserção do painel

A matriz de `trip.schema.ts:1863-1928` diz o que o Postgres aceita. Três delas o painel podia
violar, e a descoberta seria um 500 em produção:

| CHECK                     | Regra                                       | Teste                        |
| ------------------------- | ------------------------------------------- | ---------------------------- |
| `..._read_number_check`   | `read_number` e `read_source` juntos ou nem | varre **todos** os vereditos |
| `..._read_series_check`   | série só com número                         | varre todos os vereditos     |
| `..._auto_approval_check` | `approved` exige `read_source = 'barcode'`  | varre todos os vereditos     |

Os testes não checam um caso: montam a lista dos nove vereditos que a função consegue produzir e
passam a invariante em cima de todos. Ramo novo entra na lista ou a asserção não o cobre — mas
ramo novo que viole a CHECK cai, porque a lista é construída pelos mesmos `resolve`.

#### O caso que o enunciado não previa e o banco impõe

Uma nota casada **pela chave** pode não ter número impresso (`nfeNumber === null`): o casamento por
`accessKey` não exige número. Aprovar ali gravaria `read_source = 'barcode'` com `read_number`
nulo — exatamente o que a `..._read_number_check` recusa. Então a nota sem número **não aprova**:
cai em pendente sem leitura. O estado é alcançável, não impossível, e tem teste próprio.

#### O OCR nunca aprova (RF26)

Só `matched` por código de barras devolve `approved`. `otherSelected` e `onTripNotSelected` ficam
pendentes **carregando a leitura** — a tela precisa mostrar qual nota o canhoto aponta (tabela de
casos de borda da `spec.md`). `notOnTrip` não carrega leitura: não há nota da viagem a apontar.

#### O prazo é um veredito, não um erro (RNF02)

`CANHOTO_REVIEW_TIMEOUT_MS = 20_000`, e o estouro entra na matriz como `CANHOTO_REVIEW_TIMED_OUT`
— o mesmo desenho do `OCR_TIMEOUT` do motor, **reusado** em vez de um segundo utilitário de prazo
(`raceAgainstTimeout` já existia em `canhotoOcrEngine.service.ts`).

⚠️ O prazo de 20 s **não é exercitado por espera real** — seria um teste de 20 s. O que os testes
prendem é a constante, o ramo do estouro na função pura, e a orquestração com o reconhecedor
injetado. A espera real fica coberta pelo utilitário, que já tem contrato próprio.

#### A orquestração tem contrato porque tem ramos

`reviewCanhoto` lê o código de barras primeiro e **só acorda o OCR quando ele não leu** — um
contrato conta as chamadas do reconhecedor e exige zero quando o código de barras decidiu. Os
outros três: OCR desligado não chama nada; palavras reconhecidas viram sugestão `ocr`; reconhecedor
que devolve `undefined` não inventa leitura.

#### O tipo da lista de notas estava errado e o teste pegou

`reviewCanhoto` recebia `readonly CanhotoOcrTripDocument[]` — tipo que **não carrega
`accessKey`**. Com ele, o caminho do código de barras jamais casaria uma nota, e o painel nunca
aprovaria canhoto nenhum. Corrigido para `CanhotoReviewTripDocument`, que é o tipo do OCR mais a
chave; os dois leitores leem a mesma lista.

#### Os testes não são vazios — provado por três mutações

```
1. OCR passa a devolver 'approved'          → 3 fail (2 casos + a CHECK de aprovação automática)
2. nota sem número passa a aprovar          → 2 fail (o caso + a CHECK de número/origem)
3. OCR roda mesmo com o código já lido      → 1 fail (a contagem de chamadas do reconhecedor)
```

Restaurado do backup depois de cada uma; `grep -c` volta ao valor original em todas.

#### Portões

```
$ bun test ./test/trip.contract.test.ts
 1959 pass · 0 fail · 19871 expect()  [1.09s]        → EXIT=0
$ bun run typecheck (apps/frontend-transportada)      → EXIT=0
$ bun run test (suíte inteira do painel)
 5832 pass · 0 fail  +  81 pass · 0 fail              → EXIT=0
$ bun run lint  → 0 erros; 16 avisos, todos pré-existentes e em outros arquivos
$ bunx prettier --check (3 arquivos tocados)          → limpo
```

Nenhum comando da API: a task é só do painel, não toca `test/integration/**` nem schema — sem
`make migration-test` e sem os dois comandos da API.

---

## T6.6 + T6.7 + T6.8 — a conferência do canhoto vira rota, caso de uso e trilha

Três tasks, um commit. Contrato antes da implementação nas três; árvore comitada vermelha quebraria
o portão de quem vem depois, como já aconteceu na T6.4/T6.5.

### O que a rota aceita — e o que ela recusa por construção

`PATCH /trips/:id/documents/:documentId/proof/review`, sob `trip.manage`, aceita **só**
`approve` e `reject`. O veredito automático (`action: 'automatic'`) existe como forma de comando na
porta, para o caminho interno da leitura, e **fica de fora da união discriminada do Zod**: aceitar
uma aprovação automática vinda do painel deixaria RF26 ("OCR nunca aprova sozinho") valendo por
convenção em vez de por tipo. `companyId`, autor e IP vêm do contexto autenticado — `companyId` no
corpo é 400.

### Onde mora a regra

Toda a validação (motivo × nota, 20–500 caracteres, dado pessoal, coerência da leitura) está na
política de domínio, não no Zod. Dois motivos: é o espelho das CHECK de `trip_delivery_proofs`, que
precisam de um lugar só, e o caminho automático não passa por HTTP — regra em `parse` não o
alcançaria.

`canhoto-review-decision.policy.ts` é arquivo novo, separado do `canhoto-review.policy.ts`
existente: aquele trata do **conjunto de colunas** (valor inicial, reset no `ON CONFLICT`), este de
**decidir um veredito**. Juntos passariam de 200 linhas.

### A guarda de dado pessoal nasceu em `src/shared/`

`src/shared/personal-data.policy.ts`, fora do módulo de viagens, para a spec 162 reusar quando for
implementada (a guarda dela nunca existiu — conferido por três buscas independentes: só
`monetary-redaction.service.ts` para dinheiro e um `\d{11}` sem relação em
`aggregate-document-ocr.policy.ts`).

Devolve a **categoria**, nunca o valor: a mensagem de erro não pode vazar o dado que ela recusou.
Duas fronteiras deliberadas, documentadas no arquivo:

- **8 dígitos soltos não são CEP.** Colidem com número de nota e com valor sem separador. CEP só é
  reconhecido pontuado (`\b\d{5}-\d{3}\b`).
- **11 dígitos crus casam CPF primeiro.** É CPF ou celular — dado pessoal nos dois casos, e a
  categoria só existe para a mensagem.

### Duas consultas para travar, de propósito

`lockCanhotoProof` localiza o canhoto pela junção (`trip_delivery_proofs` → `trip_stop_events` →
`trip_documents`, filtrando empresa, documento e **viagem**) e só então trava a linha do
comprovante com `FOR NO KEY UPDATE` por `(companyId, id)`. Travar na junção contenderia com a FK
composta que outra escrita pega com `FOR KEY SHARE` — o padrão que o `CLAUDE.md` da app recusa.

A viagem entra no `where`, não só na assinatura: sem ela, uma nota de outra viagem da mesma empresa
devolveria o canhoto dela. `null` vira **404, nunca 403**.

### A trilha leva o motivo, nunca o texto

`audit_logs` não tem coluna de IP — ele viaja em `metadata`, como `insertTripFieldOfficeAudit` já
faz. A entrada da porta é plana; a persistência monta o `metadata`. **O texto livre não entra**
(RF31): só o motivo da lista fechada. O contrato prova por asserção sobre o JSON inteiro da entrada.

Repetir a mesma decisão não escreve nada — nem linha, nem trilha. Trocar decisão humana por outra é 409.

### Os testes não são vazios — provado por três mutações

```
1. automático passa por cima da mão        → 2 fail
2. guarda de dado pessoal desligada        → 1 fail
3. OCR pode aprovar sozinho (RF26)         → 1 fail
```

Restaurado do backup depois de cada uma; 21 pass · 0 fail em todas as restaurações.

### Portões

```
$ bun --env-file=../../.env.test test ./test/canhoto-review.contract.test.ts ./test/personal-data.contract.test.ts
 50 pass · 0 fail · 92 expect()                       → EXIT=0
$ bun --env-file=../../.env.test test --timeout 120000   (suíte de contrato inteira da API)
 8400 pass · 23 skip · 0 fail · 27137 expect() · 192 arquivos [40.13s]  → EXIT=0
$ bun run typecheck (apps/api-transportada)           → EXIT=0
$ bun run lint  → 0 erros; 16 avisos, todos pré-existentes e no painel
$ bun run format                                      → EXIT=0
```

Nenhuma task tocou `test/integration/**` nem schema: sem o segundo comando da API e sem
`make migration-test`. As duas entradas novas (`canhoto-review`, `personal-data`) entraram na lista
explícita do `package.json` — sem isso o teste existe e não roda.

---

## T6.10 — o veredito não é portão

CA13 diz o que **não** pode acontecer, e isso não se prova exercitando o caminho feliz: um portão
novo compila, passa em todo teste de entrega e só aparece no dia em que a operação trava por causa
de uma foto torta. A prova é estrutural, no formato da varredura da spec 082
(`receiver-document-logging.contract.ts`): se nenhum caminho de decisão **lê** a coluna, nenhum
caminho de decisão pode barrar por ela.

`test/canhoto-review/no-gate.contract.ts` varre `src/**` inteiro (não só `src/trips/`, porque
faturar mora em `src/billing/`) e exige que a lista de arquivos que mencionam `canhotoReview` seja
**exatamente** o módulo de conferência mais o schema e o `main.ts`, que só liga a rota. Igualdade,
não inclusão: arquivo novo falando do veredito vira decisão de projeto explícita, não descuido.

Por cima disso, os nove portões da CA13 são nomeados um a um e testados individualmente — faturar,
lote de CT-e, prontidão fiscal, manifesto, os três despachos e os dois caminhos da baixa de entrega.
Nomeá-los faz o teste falhar quando um deles é renomeado, em vez de calar.

### O teste não é vazio

```
mutação: `// canhotoReview` no fim de dispatch-trip.use-case.ts  → 2 fail
         (o portão nomeado + a igualdade da varredura)
```

Restaurado do backup; 11 pass · 0 fail.

### Portões

```
$ bun --env-file=../../.env.test test ./test/canhoto-review.contract.test.ts
 51 pass · 0 fail · 86 expect()                       → EXIT=0
$ bun run typecheck (apps/api-transportada)           → EXIT=0
```

A suíte nova entra pelo entrypoint `canhoto-review.contract.test.ts`, já registrado no
`package.json` na task anterior.

## T6.9 — canhoto recusado volta como trabalho, com o motivo visível

**RF29.** A fila de fotos pendentes do motorista fechava a pendência ao ver _qualquer_ comprovante
de canhoto na nota. Com a conferência, "tem foto" deixou de significar "está comprovado": um canhoto
ilegível é exatamente uma foto que existe e não serve. A nota volta para a fila, e volta explicada.

Isto não é portão (RF30): a entrega continua confirmada, a viagem continua andando, o CT-e continua
saindo. O que volta é o trabalho de refazer a foto.

### Onde a pendência mora

Há duas superfícies de pendência no produto, e a escolha entre elas não é óbvia:

| Superfície                                | Quem vê                                  | Permissão    | Conteúdo hoje             |
| ----------------------------------------- | ---------------------------------------- | ------------ | ------------------------- |
| `GET /pending-items`                      | painel, página `/pendencias`             | `fleet.read` | só veículo sem carroceria |
| `pendingProofs` de `GET /me/current-trip` | app do motorista, tela "Fotos pendentes" | motorista    | nota entregue sem foto    |

A RF29 diz "volta a aparecer como comprovante pendente **para o motorista**" — é a segunda. A
primeira é fila do escritório, com uniões de um membro só e nenhum consumidor no app do motorista.

### A regra saiu para uma política pura

`src/trips/domain/canhoto-recapture.policy.ts`. O ponto de uso é um `flatMap` sobre uma consulta de
sete junções: provar ali cada caso de borda custaria um Postgres por caso — e o caso de borda é
justamente o que ninguém escreve. A política tem duas funções e nenhuma dependência de infra.

`review` é `TripDeliveryProofCanhotoReview | null`: `null` é a junção à esquerda sem linha nenhuma,
que não é a mesma coisa que `not_applicable`. Inventar um `not_applicable` de mentira para o caso
"nunca teve canhoto" apagaria a diferença no tipo.

Dois chamadores, uma regra: a fila (`listPendingProofs`) e o cartão da parada ao vivo
(`listDeliveryPhotoPresence`). Sem o segundo, uma recusa durante a viagem aberta mostraria "foto
feita" no cartão e "pendente" na fila.

### A varredura do não-portão reclamou, e estava certa

A igualdade de `no-gate.contract.ts` acusou o repositório novo lendo `canhotoReview`. É o teste
fazendo o que existe para fazer: leitor novo do veredito é decisão de projeto. Entrou na lista com o
porquê escrito — dar trabalho de volta a quem tirou a foto não é barrar entrega, viagem, CT-e nem
fatura.

### O app do motorista

`canhotoRejection` atravessa a fronteira em `toCanhotoRejection`, e o critério é o oposto do resto
do item: o motivo é **acessório**. Recusa malformada, ou motivo que este app não conhece (API mais
nova), apagam a explicação e mantêm a pendência — a nota precisa voltar mesmo sem legenda. O que
derruba o item continua sendo só `documentId`/`tripId`.

Na tela, o motivo sai num bloco de alerta acima do formulário, com título e o texto do motivo; em
`other`, o texto livre da conferência é o próprio texto. Os quatro motivos têm frase nos dois
idiomas, e o teste exige a lista **exata** — motivo novo sem tradução reprova.

**O painel não recebeu esta mudança.** O módulo `driver-trip` de `apps/frontend-transportada` é o
caminho de transição da ADR-0075 (Fase 10 da spec 189, sob aprovação humana) e já está atrás desde a
193 — não tem `recipientDisplayName` nem `recipientIsCompany`. Os três commits anteriores desta
mesma spec também tocaram só `apps/frontend-driver`. Fazer o gêmeo crescer agora é reanimar módulo
marcado para remoção.

### O teste não é vazio

```
mutação: `isRejected` devolvendo `false`               → contrato 6 fail · integração 1 fail
mutação: `toCanhotoRejection` devolvendo sempre `null` → 2 fail
mutação: `illegible` fora do `driverTrip.locale.json`  → 1 fail
```

Restaurados dos backups; tudo verde de novo.

### Portões

```
$ bun --env-file=../../.env.test test ./test/canhoto-review.contract.test.ts ./test/driver-trip.contract.test.ts
 197 pass · 0 fail · 593 expect()                              → EXIT=0
$ bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts --timeout 120000
 18 pass · 0 fail · 104 expect()  [32.23s]                     → EXIT=0
$ bun run typecheck (apps/api-transportada)                    → EXIT=0
$ bun run typecheck (apps/frontend-driver)                     → EXIT=0
$ bun run test (apps/frontend-driver)
 865 pass · 0 fail · 1809 expect()                             → EXIT=0
$ bun run lint (apps/frontend-driver)                          → EXIT=0
```

⚠️ `bun test` cru em `apps/frontend-driver` acusa 5 falhas que não são desta task: a descoberta
padrão do Bun pega os arquivos de smoke do Playwright ("Playwright Test did not expect test() to be
called here"). É por isso que o `package.json` nomeia os três entrypoints — `bun run test`, não
`bun test`.

A suíte nova (`test/driver-trip/canhoto-recapture.contract.ts`) entra pelo barril
`test/driver-trip.contract.test.ts`, já nomeado no `package.json`.
