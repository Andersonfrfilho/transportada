# 040 — evidências

Preenchido por task, com a saída real dos gates. Sem token, sem PII.

## T003 — contrato vermelho dos cabeçalhos

`nota-rp-v2-client.contract.test.ts` (worker) e `nota-rp-parity.contract.ts` (cron) passaram a
exigir `X-AUTH-USER-TOKEN` + `X-AUTH-IM` e a ausência de `authorization`. Novo arquivo
`test/nota-rp-v2/no-bearer.contract.ts`: varredura de fonte sobre **os dois** clientes — um `Bearer`
acrescentado "por garantia" ao lado dos cabeçalhos certos passaria em todo teste de comportamento,
porque o dublê de `fetch` só vê o que o cliente monta hoje.

Achado do caminho: o contrato do worker **fixava o defeito** —
`expect(call.headers['authorization']).toBe(\`Bearer ${'${API_TOKEN}'}\`)`. Era por isso que ele
sobreviveu.

Vermelho: 7 falhas (4 delas na varredura de fonte).

## T004 — os dois clientes, na mesma task

`buildHeaders` nos dois clientes manda `X-AUTH-USER-TOKEN` (token da conta) e `X-AUTH-IM`
(inscrição municipal, qual empresa dentro da conta). `authorization` saiu.

A inscrição municipal não era lida por ninguém; foi encadeada da linha da credencial até o cliente
nas duas apps: `NfseCredentialAccess` (worker) e `NfseReconciliationCredential` (cron), os dois
repositórios Drizzle, o `select-due-invoices.use-case.ts` e a cópia do schema no cron
(`nfse_provider_credentials`, não `nfse_issuance_attempts` — o erro foi pego pelo `tsc`).

```
apps/worker-transportada  typecheck ok · 455 pass · 0 fail (59 arquivos)
apps/cron-transportada    typecheck ok · 182 pass · 0 fail (8 arquivos)
bun run lint              4 apps, 0 aviso
```

A coluna já existe no schema da API com `.default('')` — é a T006 que tira o default e a torna
obrigatória.

## T012 — contrato vermelho do corpo do `/emitir`

`test/nfse-fiscal-gateway.contract.ts` passou a fixar o corpo oficial: presença de `CodigoCnae`,
`RazaoSocial`, `CpfCnpj`, `DataEmissao` em `dd/mm/aaaa`, `CallbackUrl`, `IssRetido` booleano e
`ItemListaServico` sem ponto; ausência de `Cnae`, `TomadorRazaoSocial`, `TomadorCnpjCpf` e
`ValorIss`.

Vermelho nas oito chaves de uma vez — o `buildRps` anterior errava nome, tipo e formato ao mesmo
tempo, e nenhum teste olhava para o corpo montado.

## T013 — `buildRps` contra o contrato oficial

O relógio entra injetado e a data é formatada em `America/Sao_Paulo` por `Intl.DateTimeFormat`: o
payload congelado não carrega data, e a prefeitura valida a emissão contra a competência corrente —
UTC viraria o dia às 21h e recusaria a nota da noite.

`ItemListaServico` sai por `toServiceListItemCode`: tira o que não é dígito e derruba o zero à
esquerda, porque o id da lista é `1602`, não `16.02`.

## T014 — contrato vermelho da resposta do `/emitir`

O envelope de sucesso é `{success:true, message, id_nota: 30201}` — `id_nota` **numérico e no topo**,
sem `data` em volta. Exigir `data` era o que transformava emissão aceita em `malformed_response`.

A recusa da v2 é `{success:false, message}` e nada mais: código de erro só existe no postback, dentro
de `MensagemRetorno[].Codigo`. O contrato passou a exigir a `message` do provedor com
`NOTA_RP_UNKNOWN` no lugar do código, e o `failureBody` do fixture perdeu o parâmetro `code` que a v2
nunca manda.

## T015 — `readEnvelope`/`issue` acertados

`readEnvelope` devolve o envelope inteiro (não mais o `data` de dentro), `readIdentifier` aceita
inteiro seguro e o converte, e `fetchStatus` — que **tem** `data` — passou a desembrulhar por conta
própria. Recusa sempre sai com `UNKNOWN_REJECTION_CODE`.

De passagem, o cabeçalho do arquivo dizia o oposto do que a A2 estabeleceu ("o vocabulário de fio é
inferido, a coleção oficial não está no repositório") e apontava para um T030 que a coleção
dispensou. Reescrito: o envelope agora é conferido, e o que segue inferido é só `situacao`/`codigo_erro`
da consulta, que nenhum exemplo da coleção cobre.

```
apps/worker-transportada  typecheck ok · 463 pass · 0 fail (59 arquivos)
apps/cron-transportada    typecheck ok · 182 pass · 0 fail (8 arquivos)
```

## T017 — contrato vermelho do cancelamento

```
Expected: "https://nota-rp.invalid/api/v2/cancelar-nota"
Received: "https://nota-rp.invalid/api/v2/cancelar"
(fail) Nota RP v2 client — cancelamento > pede o cancelamento em POST /cancelar-nota com id_nota e motivo
```

O teste antigo conferia o corpo por `Object.values(body)).toContain(...)` — cego a nome de chave. Era
por isso que `motivo_cancelamento` sobrevivia: o valor estava lá, sob a chave errada. Agora a
asserção é por chave (`body['motivo']`) e há um caso negativo para `motivo_cancelamento`.

## T018 — rota e chave do cancelamento

`ROUTE_CANCEL` virou `/cancelar-nota` e o corpo saiu com `motivo`. O **valor** continua sendo o texto
do operador: a coleção mostra `"2"` sem legenda, e inventar tabela de código de cancelamento seria
inventar regra do provedor. Aberto na T016.

## T019 — a recusa sem código, nas duas cópias

O cliente do cron lia `readText(body, 'code')` de um envelope que nunca traz `code`. Sozinho isso é
inofensivo (cai no `??`), mas era o último resto da inferência que a A2 desfez do outro lado — e o
contrato de paridade **fixava o defeito**, mandando `{code:'E001'}` no corpo e exigindo `E001` na
saída, algo que o cliente do worker jamais produziria.

O caso novo é o que dá o vermelho: envelope de recusa **com** `code`, e a exigência de que os dois
clientes o ignorem.

```
(fail) Nota RP v2 status client parity > ignores a code field in the refusal envelope, matching the worker client table
```

O `failureBody` do fixture do cron perdeu o parâmetro `code`, como o do worker. O `tsc` pegou o
call site restante (higiene de segredo) que o `bun test` deixou passar — propriedade extra em objeto
literal não incomoda o runtime.

```
apps/worker-transportada  typecheck ok · 466 pass · 0 fail (59 arquivos)
apps/cron-transportada    typecheck ok · 183 pass · 0 fail (8 arquivos)
bun run lint              4 apps, 0 aviso
```

## T007/T008 — o `CallbackUrl` obrigatório

O contrato exige que todo payload de emissão saia com `CallbackUrl` https e que emissão sem base
configurada nem chegue à rede. Vermelho antes da implementação, e verde depois com a URL montada
**dentro do gateway** — a base configurada mais o token opaco que vem do envelope selado.

Desvio deliberado do enunciado da T007 ("o tipo de emissão exige `callbackUrl`"): a URL **não**
atravessa a porta de emissão. Quem abre o envelope é o gateway, uma vez por operação; fazer o
consumidor montar a URL obrigaria o `callbackToken` a passar pelo leitor de execução e pela porta,
dois lugares a mais para um segredo aparecer.

```
apps/worker-transportada  T007 8 pass · 0 fail
apps/worker-transportada  environment.contract 18 pass · 0 fail
apps/worker-transportada  466 pass · 0 fail · typecheck ok · lint limpo
```

## T005/T006 — a inscrição municipal deixa de ser opcional

A inscrição vai no `X-AUTH-IM` de toda chamada à Nota RP. Em branco o provedor responde **200 com
`cadastro: null`**, e a credencial só se revela inválida na primeira emissão — longe de onde foi
gravada. O vermelho:

```
(fail) nfse profiles credential routes > refuses to save a credential without a municipal registration
Expected: [400, 400]
Received: [200, 200]
```

O `.min(1)` entrou no `saveCredentialSchema` e o `.default('')` saiu da coluna. A coluna já era
`not null` — o que a deixava passar em branco era o próprio padrão, que escrevia `''` sem ninguém
pedir. A migration `20260817185545_nfse_credential_municipal_registration` faz `drop default` mais
`check (length(municipal_registration) > 0)`; o `rollback.sql` devolve os dois e apaga a própria
linha do diário, conferindo que removeu exatamente uma.

Conferido no banco de **produção** antes de aplicar: uma credencial selada, `notarp` / `production` /
`active`, inscrição de 8 caracteres. Nenhuma em branco — o aperto passa sem tocar em dado, e por isso
o rollback é honesto (devolve a permissividade, não um dado perdido).

Dois testes já existentes caíram junto, e é o que se espera de um aperto de contrato: o fixture de
`tax-id-boundary` mandava corpo sem a inscrição (ali o assunto é o CNPJ, então o corpo passou a ser
completo) e a lista de diretórios do `static-migration` não conhecia a migration nova.

O frontend acompanhou: sem isso o operador trocaria uma mensagem de campo por um 400 genérico —
"não foi possível salvar", sem dizer o que falta.

```
apps/api-transportada       2551 pass · 15 skip · 0 fail
make migration-test           70 pass · 0 fail
apps/frontend-transportada   225 pass · 0 fail · typecheck ok · lint limpo
```

## T016 — a tabela do `motivo`, com a origem

Origem: `NotaRP-desenvolvedores-v2/changelog (v2).md`, seção "Mudança no endpoint `/cancelar-nota`" —
documentação oficial entregue pelo cliente, não sondagem. A coleção Postman sozinha não bastava: ela
mostra `"motivo": "2"` sem legenda, e foi por isso que a pergunta nasceu.

| `motivo` | significado          | observação                                                   |
| -------- | -------------------- | ------------------------------------------------------------ |
| `1`      | Erro na emissão      | **recusa** o cancelamento pedindo para usar substituir NFS-e |
| `2`      | Serviço não prestado | —                                                            |
| `4`      | Nota duplicada       | —                                                            |

Não existe `3`. O campo é **obrigatório** e o exemplo oficial manda **string** (`"2"`), não número —
ao contrário do `id_nota` do mesmo corpo, que vai numérico (`30200`).

Duas consequências que a A2 não tinha como prever:

- O que mandamos hoje é o **texto livre** do operador. Ele não é código nenhum, então todo
  cancelamento que sair daqui é recusado pela prefeitura. Corrigir é a T020.
- O código `1` não cancela: ele devolve pedindo substituição. Oferecê-lo como opção de tela sem
  dizer isso é montar um caminho que sempre falha.

Segue **em aberto** o segundo item da sondagem: a documentação não diz se `id_nota` aceita string.
`providerDocumentId` não tem promessa de ser numérico, e `Number()` cego viraria `NaN` no corpo —
então não se converte sem confirmar. Vai na T020.

## Achado fora de task — `/xml` e `/pdf` vêm em base64

Mesma fonte, entradas "Novo endpoint `/xml`" e "Novo endpoint `/pdf`": os dois "para receber o
XML/PDF da nota em **base64**".

`readDocument` — nas duas cópias, worker e cron — arquiva `arrayBuffer()` cru. Isso grava o texto
base64 sob `application/xml` e `application/pdf`, sem erro em lugar nenhum do caminho. O XML é o
documento fiscal e é ele que liquida a nota: o defeito não aparece na emissão, aparece quando alguém
for abrir o arquivo.

Falta saber se o base64 vem como corpo de texto puro ou dentro de envelope JSON — e `readDocument`
hoje trata `content-type: application/json` como falha, então o segundo caso falharia calado.
Virou a T021.

## T010 — gates e auditoria de go-live

Gates:

```
apps/api-transportada       2551 pass · 15 skip · 0 fail
apps/worker-transportada     466 pass · 0 fail
apps/cron-transportada       183 pass · 0 fail
apps/frontend-transportada   225 pass · 0 fail (nfse-invoice)
make migration-test           70 pass · 0 fail
lint · typecheck             limpos nas quatro apps
```

`make check` fecha em `format:check` por **dois arquivos que não são desta spec** —
`nfe-workspace/pages/NfeWorkspace.page.tsx` e `test/nfe-workspace/scheduled-distribution-panel.contract.ts`,
da 041, em edição por outra sessão na mesma árvore. Formatá-los daqui seria escrever por cima de
trabalho em curso. Os arquivos da 040 passam no `prettier --check`.

Auditoria:

- **Token em log:** nenhum caminho de NFS-e loga o token. Os quatro pontos de log do cron carregam só
  identificador opaco (`companyId`, `invoiceId`, `errorCode`, `lockKey`); o do callback na API carrega
  `correlationId` e `error.name`, nunca a mensagem. O `nfse-issuance` do worker não tem chamada de
  log nenhuma. O que vem do provedor passa por `redact` antes de virar `message`.
- **Corpo do provedor em resposta de erro:** não há como vazar. A emissão é assíncrona — o corpo do
  provedor nunca é corpo de resposta HTTP —, e o 500 é constante fixa (`HTTP_ERROR.internal`,
  `'Internal server error'`). O `message` da recusa **é** mostrado ao operador, e isso é o desenho:
  é a explicação da prefeitura sobre a nota dele.
- **Segredo em histórico de shell:** `grep -c 'X-AUTH-USER-TOKEN\|notarp' ~/.zsh_history` → `0`. A
  sondagem da Fase 0 não foi feita, então não há o que ter vazado.

**Um achado**, que virou a T022: `redact` corta só o `apiToken`. O `callbackToken` viaja dentro da
`CallbackUrl`, no corpo do `/emitir`, e o cliente sequer o conhece — se a prefeitura devolver a URL
dentro da `message` de uma recusa de validação (justamente o caso em que a URL é o assunto), o token
de callback é gravado em claro na rejeição da nota. Não bloqueia a emissão; bloqueia dormir tranquilo.

## T022 — o segundo segredo do pedido passa a ser redigido

O achado da auditoria da T010, fechado. São **dois** segredos no mesmo pedido, e o segundo não vai em
cabeçalho: o `callbackToken` viaja dentro da `CallbackUrl`, no corpo do `/emitir`. O `redact` do
cliente cortava só `config.token`.

Contrato vermelho antes, em dois caminhos de mensagem — não um, porque são duas portas por onde texto
do provedor vira `rejection.message` nossa:

```
(fail) … > a recusa que devolve a CallbackUrl sai sem o token de callback
  Expected to not contain: "notarp-v2-synthetic-callback-token-do-not-leak"
  Received: "CallbackUrl invalida: https://transportada.invalid/public/nfse-callbacks/notarp-v2-…"

(fail) … > a consulta que devolve a CallbackUrl na mensagem de erro também sai redigida
  Received: "Retorno nao entregue em https://transportada.invalid/public/nfse-callbacks/notarp-v2-…"
```

Verde depois: `468 pass · 0 fail` no worker (eram 466), `typecheck` e `lint` limpos nas quatro apps.

O que mudou:

- `NotaRpV2Config` ganhou `callbackToken` **obrigatório**. O cliente não o usa para autenticar coisa
  nenhuma — ele chega ali só para ser redigido. Obrigatório e não opcional porque só existe um ponto
  de construção (`nfse-fiscal-gateway.ts`, que já tinha o valor em mãos): campo opcional aqui seria um
  convite a esquecê-lo no próximo ponto de construção que aparecer.
- `redact` dobra sobre uma lista de segredos, **filtrando o vazio**. Cortar string vazia partiria a
  mensagem inteira entre `[REDACTED]` — o `split('')` de JavaScript devolve cada caractere.
- O fixture ganhou `CALLBACK_TOKEN`, e a `CALLBACK_URL` passou a ser derivada dele. Antes a URL de
  teste terminava em `opaque-token`, literal: nenhum teste conseguiria provar que o token some da
  mensagem se ele não estivesse na mensagem.

A cópia do cron **não** recebeu o campo, e é deliberado: `grep -n 'CallbackUrl\|callback'` no cliente
e no gateway dela não devolve nada. Ali só se consulta e se baixa documento — não há segundo segredo
a redigir, e acrescentar o campo seria paridade de forma sem paridade de risco.

## T020 — o `motivo` passa a ser código, e o texto do operador vira outro campo

A task foi entregue em duas pernas. A perna de API e worker fechou antes, e o registro dela é o
código somado ao verde das suítes abaixo — a saída vermelha daquele momento não foi capturada, e
inventá-la aqui seria pior que não tê-la. A perna do frontend foi vermelha primeiro, nos cinco pontos
que a tocam:

```
(fail) o catálogo de motivos não oferece o código que a prefeitura recusa
  → 'NFSE_CANCELLATION_MOTIVES' ainda não existia em nfseInvoice.constant.ts

(fail) sends creation and cancellation as idempotent requests
  → o corpo saía só com cancellationReason

(fail) o diálogo de cancelamento monta o campo do motivo
  → o diálogo não importava '@/components/ui/select'

(fail) o lote escolhe o código do motivo do mesmo catálogo da nota avulsa
  → idem no diálogo de lote, e o hook não tinha cancellationMotive

(fail) as chaves de nfseInvoice.locale.json e .en. coincidem
  → cancelDialog.motive* e bulkCancel.motiveHint faltavam nas duas línguas
```

Verde depois, nos quatro gates e nas quatro apps:

```
frontend  bunx tsc --noEmit                             → limpo
frontend  bun test ./test/nfse-invoice.contract.test.ts → 228 pass · 0 fail · 1118 expect() [175ms]
frontend  bun run test (18 arquivos)                    → 1314 pass · 0 fail · 6799 expect() [435ms]
api       bun run test (107 arquivos)                   → 2559 pass · 15 skip · 0 fail [3.35s]
worker    bun run test (59 arquivos)                    → 471 pass · 0 fail · 1106 expect() [502ms]
cron      bun run test (8 arquivos)                     → 183 pass · 0 fail · 345 expect() [294ms]
raiz      bun run lint · bun run typecheck              → limpos nas quatro apps
```

O que mudou:

- **Dois campos, dois destinos.** `cancellationMotive` é o código que a prefeitura lê;
  `cancellationReason` continua sendo o texto do operador, que fica no registro da nota e **não**
  atravessa a fronteira do provedor. O schema da API é `.strict()` e exige os dois: um cancelamento
  sem código não deve chegar ao worker, e um sem texto perde a única explicação legível de quem
  cancelou. O `grep` no `nota-rp-v2.client.ts` prova o corte — o corpo é
  `{ id_nota, motivo: cancellationMotive }`, e `cancellationReason` não aparece no cliente.
- **O catálogo tem dois códigos, não três.** `NFSE_CANCELLATION_MOTIVES = ['2', '4']` no frontend e o
  `CHECK` homônimo no banco. O `1` (erro na emissão) fica de fora **de propósito**: a documentação da
  v2 diz que a prefeitura o recusa pedindo substituição da nota, e aceitá-lo levaria a nota a
  `cancellation_requested`, liberaria as NF-e vinculadas e a deixaria esperando um retorno que nunca
  chega. Oferecer na tela um caminho que sempre falha é pior que não oferecer.
- **Sem motivo padrão.** O estado nasce `''` nos dois diálogos, e `isCancelReady` — que substituiu
  `isReasonReady` nos dois hooks — só libera o botão com texto válido **e** código escolhido. Escolher
  um padrão seria decidir no lugar de quem cancela; e bloquear na tela é mais barato que o 400
  genérico da API, o mesmo precedente da inscrição municipal (T005/T006).
- **Um flag, não dois.** `isReasonReady` foi renomeado, não somado: `grep` nos testes não devolveu
  nenhuma referência ao nome antigo, e duas flags sobrepostas ("o texto está bom" ao lado de "o pedido
  está completo") divergem no primeiro campo novo.
- **O lote leva um código só**, escolhido uma vez no diálogo e repetido em toda nota da fila — o laço
  sequencial já existia por causa do 429 da prefeitura, e o código entra nele como `run.motive`.
- **O `reasonHint` era mentira e foi corrigido, nas duas línguas.** Ele dizia "A prefeitura registra
  este texto na nota"; desde que o texto livre deixou de sair no corpo, o certo é "Fica registrado na
  nota, para consulta interna."

A cópia do cliente no cron **não** mudou, e o `grep -n 'cancel' nota-rp-v2.client.ts` diz por quê:
ali não existe `ROUTE_CANCEL` nem método de cancelamento. O cron consulta e baixa documento.

O segundo item da sondagem **segue aberto**: o `id_nota` continua indo como texto. A documentação não
diz se a string é aceita, e `Number()` cego viraria `NaN` no corpo — a conversão só entra com
confirmação. A T001/T002 tentou e **não** conseguiu confirmar: a busca da conta não devolve nota
nenhuma e `/xml/{número da NFS-e}` responde "Nota não encontrada", porque o `id_nota` é identificador
interno do provedor e só aparece na resposta do `/emitir`. A dependência passa a ser a **primeira
emissão real pelo nosso worker** — ver o registro da T001/T002 abaixo.

## T001 e T002 — a sondagem contra a conta autenticada

Feita em 17/08/2026 contra `https://www.notarp.com.br/api/v2`, com a credencial real da conta
(inscrição municipal `20935293`). O token entrou por variável de shell, nunca foi impresso, e a
saída abaixo passou por um filtro que o substituiria caso aparecesse. O corpo do `cadastro` traz
e-mail e telefone do contato — **redigidos aqui**, porque PII não vai para documento de spec.

```
### token válido, SEM X-AUTH-IM
{"success":true,"ultima_consulta":"17/08/2026 21:05","cadastro":null}
-- http 200

### token inventado, SEM X-AUTH-IM
{"success":false,"message":"Token inválido."}
-- http 401

### token válido, COM X-AUTH-IM
{"success":true,"ultima_consulta":"11/08/2026 16:21","cadastro":{
  "tipo":"PJ","status":"Ativo","emite_nfse":true,"mei":false,"simples_nacional":true,
  "documento":"61156864000191","inscricao_municipal":"20935293",
  "razao_social":"Afr Fernandes Transportes e Servicos Ltda",
  "email":"[REDIGIDO]","telefone":"[REDIGIDO]",
  "localizacao":{"cidade":"Ribeirão Preto","estado":"SP", …},
  "cnaes":[{"codigo":"4930202", …},{"codigo":"4930201", …}],
  "atividades":[{"codigo":"160101", …},{"codigo":"160107", …}],
  "operacoes_permitidas":[{"codigo":"1","descricao":"Exigível"}],
  "permite_deducoes":false, "permite_desconto_condicionado":…, "permite_tributar_fora":…}}
-- http 200

### token válido, COM X-AUTH-IM e COM X-Auth-CNPJ
{"success":false,"message":"Esta empresa ainda não foi migrada para a versão v3 da API. Utilize a versão v2."}
-- http 403
```

- **A premissa da spec está confirmada, e é assimétrica.** Token errado o provedor recusa na hora,
  com `401` e mensagem — dá para validar na gravação da credencial. Inscrição municipal ausente ele
  **não** recusa: responde `200`, `success: true`, e `cadastro: null`. É por isso que a obrigatoriedade
  da inscrição precisou ser nossa, na fronteira inteira: o provedor não a cobra, e sem ela a
  credencial só se revela inútil na primeira emissão, longe de onde foi gravada.
- **O `X-Auth-CNPJ` fica fora, e não por ser inócuo.** A hipótese era "se não mudar nada, fica fora".
  Mudou: com o cabeçalho a mesma chamada vira `403`, com o provedor dizendo que a empresa não foi
  migrada para a v3. Mandar o CNPJ empurra a conta para um caminho que ela não tem — o cabeçalho não
  é redundante, é quebra.
- **`operacoes_permitidas` chega**, e para esta conta tem **um** valor: `1` — Exigível. É de lá que
  saem os valores válidos de `ExigibilidadeISS`, e o catálogo de uma instalação não é o da outra.
- **`ultima_consulta` mostra que o cadastro é cache do provedor** (11/08 na resposta de 17/08). Não
  usar esse endpoint como prova de estado atual da empresa.

### O que a sondagem **não** conseguiu responder

A forma do `id_nota` continua desconhecida, e por isso ele **segue como texto**. Nenhuma nota da conta
foi alcançável pela v2:

```
/notas/                                          -> 200 {"success":true,"message":"Nenhuma nota encontrada com a busca realizada."}
/notas/?id_nota=62 · ?numero=62 · ?nfse=62       -> 200, mesma mensagem
/notas/?data_inicial=2026-08-01&data_final=…     -> 200, mesma mensagem
/xml/62                                          -> 200, content-type application/json, {"success":false,"message":"Nota não encontrada"}
```

A conta emitiu a nota nº 62 em 04/08/2026 (XML nacional em mãos, `verAplic NRP-1.00`), e mesmo assim a
busca não a devolve — o `id_nota` é identificador interno do provedor, não o número da NFS-e. Ele só
aparece na resposta do `/emitir`, então a confirmação vem da **primeira emissão real pelo nosso
worker**, não de sondagem. Até lá, `Number()` cego viraria `NaN` no corpo.

### Dois achados de brinde, que não estavam na spec

- **"Nota não encontrada" não é erro para o provedor**: volta `200` com `success: true`, uma `message`
  e **sem** a chave `data`. Nosso `fetchStatus` faz `asRecord(envelope.data['data'])` e, sem `data`,
  devolve `cause: 'malformed_response'` — causa enganosa para o caso mais banal que existe. Vale uma
  causa própria, para a reconciliação não confundir "não achei" com "resposta malformada".
- **O provedor limita taxa**: a quarta busca seguida devolveu `429 Too Many Requests`. O laço
  sequencial do cancelamento em lote, que já existia por suspeita, tem agora confirmação.

O `/xml/62` também mostra que **falha na rota de documento chega como `200` + `application/json`** —
que é exatamente o que o `readDocument` já trata como falha. O que a sondagem não viu é a resposta de
**sucesso**, que é o objeto da T021: sem nota alcançável, não dá para saber se o base64 vem puro ou
dentro de envelope.

## T023 — "nota não encontrada" ganha causa própria

O achado de brinde da sondagem virou task e fechou. O provedor responde a busca vazia com `200`,
`success: true`, uma `message` e **sem** a chave `data`; o cliente procurava `data`, não achava, e
classificava como `malformed_response` — a causa errada para o caso mais banal do trilho, e que
sumiria no meio das falhas de contrato quando alguém olhasse o motivo do adiamento.

**Vermelho antes**, nas duas cópias:

```
apps/worker-transportada/test/nota-rp-v2-client.contract.test.ts:214
  error: expect(received).toBe(expected)
  Expected: "not_found"
  Received: "malformed_response"

apps/cron-transportada/test/nfse-status-pull/nota-rp-parity.contract.ts:155
  - "cause": "not_found"
  + "cause": "malformed_response"
```

O que mudou:

| Arquivo | Mudança |
|---|---|
| `worker/src/nfse-issuance/infrastructure/nota-rp-v2.client.ts` | `'not_found'` no `NotaRpCause`; `readMissingCause` |
| `cron/src/nfse-status-pull/infrastructure/nota-rp-v2.client.ts` | idem, no `readEnvelope` |
| `cron/src/nfse-status-pull/domain/nfse-reconciliation-outcome.policy.ts` | `'not_found'` no `NfseStatusFailureCause` |

A política precisou da causa **porque o tipo obriga**: o gateway do cron devolve o resultado do
cliente direto como `NfseProviderStatusFacts`, então causa nova de um lado sem causa nova do outro
não compila. É o mesmo seam que já amarrava `timeout` e `unexpected_status` — a paridade aqui é do
compilador, não de disciplina.

A distinção que os testes guardam é entre ausência e defeito: envelope de sucesso **sem** `data` mas
**com** `message` é `not_found`; sem `data` e sem `message` continua `malformed_response`, porque aí
não há o que distinguir. Dois casos negativos, um em cada cópia.

Na reconciliação, `not_found` cai no adiamento que já existia (`{ cause, kind: 'defer' }`) — nunca
autoriza, nunca rejeita, nunca liquida. Coberto por `outcome.contract.ts`. A causa só é **logada**
(`cron_nfse_reconciliation_deferred`): não há coluna nem `check` no banco, e portanto nenhuma
migration nesta task.

**Verde:**

```
apps/worker-transportada   473 pass · 0 fail   (Ran 473 tests across 59 files)
apps/cron-transportada     186 pass · 0 fail   (Ran 186 tests across 8 files)
bun run typecheck          exit 0   (api · worker · cron · frontend)
bun run lint               exit 0   (api · worker · cron · frontend)
```

Eram 471 e 183 antes — os cinco testes novos são os dois pares de cliente mais o adiamento.

## T021 — o documento é conferido pela própria abertura

A v2 diz no changelog que `/xml` e `/pdf` devolvem o documento **em base64**, e o `readDocument` das
duas cópias arquivava o corpo cru. A sondagem da T030 não alcançou uma resposta de sucesso — sem nota
autorizada na conta, só deu para ver a falha — e a Nota RP não tem homologação onde medir antes da
primeira nota real (ADR-0035). Medir depois seria medir com o documento fiscal do cliente.

Por isso a guarda não pergunta ao provedor qual é o formato: ela confere a **assinatura** do que
chegou. `<` abre XML, `%PDF` abre PDF; tabulação, quebra de linha, espaço e os três bytes do BOM
passam antes da abertura. O que já abre como documento vai direto; o que não abre só é aceito se
**decodificar** em algo que abra. As duas leituras possíveis do provedor ficam cobertas pela mesma
regra, e nenhuma exige saber de antemão qual delas é a verdadeira.

**Vermelho antes**, nas duas cópias — o corpo em base64 era arquivado como se fosse o documento:

```
apps/worker-transportada   3 fail · 475 pass
  decodifica o XML que vem em base64 → outcome.bytes eram os bytes do base64, não os do XML
  decodifica o PDF que vem em base64 → idem
  recusa corpo que não é o documento nem base64 dele → status "ok" onde se esperava "error"

apps/cron-transportada     3 fail · 186 pass
  decodes a base64 xml body / a base64 pdf body → mesma divergência de bytes
  refuses a body that is neither the document nor base64 of it → status "ok"
```

O que mudou:

| Arquivo | Mudança |
|---|---|
| `worker/src/nfse-issuance/domain/nfse-document-payload.policy.ts` | **novo** — `resolveNfseDocumentBytes`, pura, sem I/O |
| `cron/src/nfse-status-pull/domain/nfse-document-payload.policy.ts` | cópia por valor da política |
| `worker/src/nfse-issuance/infrastructure/nota-rp-v2.client.ts` | `readDocument` recebe `kind` e passa pela política |
| `cron/src/nfse-status-pull/infrastructure/nota-rp-v2.client.ts` | idem |

A política é **cópia por valor**, como o resto do trilho: as apps não importam código-fonte uma da
outra, e o cliente do worker já passa de 200 linhas. A paridade continua sendo comportamental —
`nota-rp-parity.contract.ts` roda a mesma tabela de corpos contra o cliente do cron.

O corpo irreconhecível vira `malformed_response`, a causa que **adia**: sem o XML a nota não liquida,
e adiar é o lado seguro. Nada de novo entra no banco — a guarda decide antes do arquivamento, e não
há coluna nem migration nesta task.

**Verde:**

```
apps/worker-transportada   478 pass · 0 fail   (Ran 478 tests across 59 files)
apps/cron-transportada     189 pass · 0 fail   (Ran 189 tests across 8 files)
worker typecheck · lint    exit 0
cron   typecheck · lint    exit 0
```

⚠️ O `bun run typecheck` da raiz **não** fecha em zero neste momento, e não é por causa desta task:
`api-transportada/test/nfse-invoices-http/invoice-queries.contract.ts` está em edição pela spec 042,
na mesma árvore de trabalho. As duas apps tocadas aqui fecham limpas isoladas.
