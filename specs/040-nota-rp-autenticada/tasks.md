# 040 — A Nota RP autenticada de verdade · tasks

Uma task por vez. Task só fecha com evidência em `evidence.md`.
Contrato antes da implementação, sem exceção — foi a falta dele que deixou o defeito passar.

## Fase 0 — sondar antes de escrever

> 🤖 Modelo: `sonnet`

- [x] **T001** — Sondagem manual contra `/dados-cadastrais` com a credencial real **e** com token
      inventado, mandando `X-AUTH-USER-TOKEN` + `X-AUTH-IM`. Confirmar que o caminho válido passa a
      trazer `cadastro` preenchido (hoje vem `null` por falta do `X-AUTH-IM`) e que o inválido
      devolve 401. Registrar de passagem se `operacoes_permitidas` chega, porque é dela que saem os
      valores válidos de `ExigibilidadeISS`.
      O token entra por variável de shell e **não** é impresso; a saída colada no `evidence.md` vai
      sem ele.
      Verificação: as duas saídas, lado a lado, no `evidence.md`.
- [x] **T002** — Com a mesma sondagem, decidir o `X-Auth-CNPJ`: mandar com e sem, e comparar. Se não
      mudar nada, fica fora e a razão vai para o `README.md` da doc no pacote fiscal, que hoje
      registra a dúvida em aberto.
      Verificação: as duas respostas no `evidence.md` e a nota atualizada no pacote.
      Resultado: **não é inócuo, é quebra** — com o cabeçalho a mesma chamada vira `403` "empresa não
      migrada para a v3". A nota foi para `VALIDACAO_MODELOS.md` §5 do pacote fiscal (não o
      `README.md`: é lá que a dúvida estava registrada, como "RP bloqueado na v3"), corrigindo o
      diagnóstico — quem provoca o 403 é o `buildHeaders` do `NotaRpNfseProvider`, que manda o CNPJ
      incondicionalmente, e não o município.

## Fase A — os cabeçalhos

> 🤖 Modelo: `sonnet`

- [x] **T003** — Contrato: `nota-rp-parity.contract.ts` passa a exigir, nas **duas** cópias, que a
      requisição carregue `X-AUTH-USER-TOKEN` e `X-AUTH-IM` com os valores da credencial, e que não
      exista `authorization`; mais um caso que falha se a string `Bearer` aparecer no fonte de
      qualquer um dos dois clientes.
      Verificação: vermelho.
- [x] **T004** — `buildHeaders` nos dois clientes
      (`worker-transportada/src/nfse-issuance/infrastructure/nota-rp-v2.client.ts:160` e
      `cron-transportada/src/nfse-status-pull/infrastructure/nota-rp-v2.client.ts:92`),
      na mesma task — são cópias por valor, e meio caminho
      deixa a reconciliação cega. A inscrição municipal precisa chegar até o cliente: hoje ela não é
      lida por nenhum dos dois.
      Verificação: T003 verde.

## Fase A2 — o corpo do `/emitir` contra a coleção oficial

> 🤖 Modelo: `opus` — é o vocabulário fiscal do pedido, e cada nome errado é uma rejeição
>
> A coleção oficial da v2 (`NotaRP-desenvolvedores-v2/API Nota RP (v2).postman_collection.json` +
> `changelog (v2).md`) chegou em 17/08/2026 e desfez a inferência que o cabeçalho do
> `nota-rp-v2.client.ts` declarava. Oito divergências no pedido e uma na resposta:
>
> | nosso                                    | oficial                       | efeito                      |
> | ---------------------------------------- | ----------------------------- | --------------------------- |
> | `Cnae`                                   | `CodigoCnae`                  | campo não chega             |
> | `TomadorRazaoSocial`                     | `RazaoSocial`                 | campo não chega             |
> | `TomadorCnpjCpf`                         | `CpfCnpj`                     | campo não chega             |
> | `IssRetido: "1"`/`"2"`                   | `IssRetido: false` (booleano) | tipo errado                 |
> | `ItemListaServico: "16.02"`              | `"1602"` (sem formatação)     | o id é o código sem `00.00` |
> | `ValorIss`                               | não existe no contrato        | campo inventado             |
> | —                                        | `DataEmissao` `"dd/mm/aaaa"`  | **obrigatório e ausente**   |
> | `CallbackUrl` opcional                   | **obrigatório, https**        | pedido não aceito           |
> | `data.id_nota` (texto, dentro de `data`) | `id_nota` numérico, no topo   | sucesso nunca é lido        |

- [x] **T012** — Contrato: o RPS que sai do gateway tem exatamente as chaves do corpo oficial —
      `CodigoCnae`, `RazaoSocial`, `CpfCnpj`, `IssRetido` booleano, `ItemListaServico` sem ponto,
      `DataEmissao` em `dd/mm/aaaa`, `CallbackUrl` — e **não** tem `Cnae`, `TomadorRazaoSocial`,
      `TomadorCnpjCpf` nem `ValorIss`.
      Verificação: vermelho.
- [x] **T013** — `buildRps` reescrito contra o contrato oficial. A data de emissão é a da
      transmissão, formatada em `America/Sao_Paulo` por relógio injetado — o payload congelado não
      carrega data, e a prefeitura valida a data contra a competência corrente.
      Verificação: T012 verde.
- [x] **T014** — Contrato: `issue` lê `id_nota` **numérico e no topo** do envelope de sucesso, e a
      recusa (`success:false`) sai com a `message` do provedor sem inventar `code`.
      Verificação: vermelho.
- [x] **T015** — `readEnvelope`/`issue` no cliente do worker acertados. O envelope de sucesso do
      `/emitir` não tem `data`; exigi-lo é o que transformava emissão aceita em `malformed_response`.
      Verificação: T014 verde.

## Fase A3 — o que a coleção revelou fora da tabela da A2

> 🤖 Modelo: `sonnet` — T016 é pergunta ao provedor, não código
>
> Conferir o corpo do `/emitir` deixou à vista três divergências que a tabela da A2 não previa,
> porque não estão no pedido de emissão:
>
> | nosso                             | oficial                     | efeito                         |
> | --------------------------------- | --------------------------- | ------------------------------ |
> | `POST /cancelar`                  | `POST /cancelar-nota`       | cancelamento nunca chega       |
> | `motivo_cancelamento` (texto)     | `motivo` código (`"2"`)     | campo não chega, valor errado  |
> | cron lê `code` do corpo da recusa | recusa da v2 não tem `code` | leitura fantasma, sem paridade |

- [x] **T016** — ~~`[NEEDS CLARIFICATION]`~~ **Respondida pela documentação oficial da v2**, não pela
      sondagem: o `changelog (v2).md` traz a tabela inteira sob "Mudança no endpoint `/cancelar-nota`"
      — `motivo` é **obrigatório** e só aceita `1`, `2` ou `4`. A tabela e o que cada código implica
      estão no `evidence.md`. Some com a `[NEEDS CLARIFICATION]`; a **implementação** do valor virou a
      T020, porque aqui a entrega era a tabela.
      Continua aberto o segundo item da sondagem: o `id_nota` do exemplo oficial é **numérico**
      (`30200`) e nós mandamos texto. A documentação não diz se a string é aceita, e `Number()` cego
      viraria `NaN` no corpo — segue na T020, a ser confirmado contra a conta autenticada.
      Verificação: tabela no `evidence.md`, com a origem.
- [x] **T017** — Contrato: o cancelamento bate em `/cancelar-nota` e o corpo sai com a chave `motivo`.
      Verificação: vermelho.
- [x] **T018** — `ROUTE_CANCEL` e o corpo do cancelamento no cliente do worker. O **valor** continua
      sendo o texto do operador até a T016 fechar — trocar rota e chave já é o que separa "recusado
      pela prefeitura" de "404 em silêncio".
      Verificação: T017 verde.
- [x] **T019** — O cliente do cron para de ler `code` do corpo da recusa (linha 153): o envelope da
      v2 é `{success:false, message}`, e ler um campo que nunca vem é a inferência que a A2 desfez do
      outro lado. `nota-rp-parity.contract.ts` passa a cobrir a recusa sem código nas duas cópias.
      Verificação: o contrato do cron fixa `NOTA_RP_UNKNOWN` + a `message` do provedor nos três
      caminhos; suíte do cron 183 pass / 0 fail.

## Fase B — a inscrição municipal deixa de ser opcional

> 🤖 Modelo: `sonnet` — T006 é 🧠, tem migration

- [x] **T005** — Contrato: `saveCredentialSchema` recusa corpo sem `municipalRegistration` e recusa
      string vazia; o teste de tenant-safety do schema de NFS-e continua verde.
      Verificação: vermelho — `refuses to save a credential without a municipal registration`
      falhou com `[200, 200]` no lugar de `[400, 400]` antes da T006.
- [x] **T006** 🧠 — Tirar o `.default('')` do `saveCredentialSchema`, migration versionada pondo a
      coluna `not null` com `rollback.sql` ao lado. Conferir antes que não há linha selada em nenhum
      ambiente.
      ⚠️ Correção do enunciado: **há** credencial selada em produção — uma linha, `notarp` /
      `production` / `active`, com inscrição de 8 caracteres, conferida no banco antes de aplicar.
      Nenhuma em branco, e é por isso que o aperto passa sem tocar em dado. A coluna já era
      `not null`; o que faltava era o `''` que o próprio `default` escrevia, então a migration
      `20260817185545_nfse_credential_municipal_registration` faz `drop default` mais o
      `check (length(...) > 0)`, e o `rollback.sql` devolve as duas coisas — a permissividade, não um
      dado perdido.
      Verificação: T005 verde, suíte da API 2551 pass / 15 skip / 0 fail, `make migration-test`
      70 pass / 0 fail. Frontend acompanhou (bloqueio na tela em vez do 400 genérico):
      `nfse-invoice.contract` 225 pass / 0 fail, `typecheck` e `lint` limpos.

## Fase C — o callback obrigatório

> 🤖 Modelo: `sonnet`

- [x] **T007** — Contrato: o payload sai sempre com `CallbackUrl` https, e emissão sem base de
      callback configurada recusa com `provider_not_configured` **sem abrir o envelope**.
      ⚠️ Desvio deliberado do enunciado original ("o tipo de emissão exige `callbackUrl`"): a URL
      **não** atravessa a porta de emissão. Ela é montada dentro do gateway, da base configurada
      mais o token opaco que vem do envelope selado — quem abre o envelope é o gateway, uma vez por
      operação, e fazer o consumidor montar a URL obrigaria o `callbackToken` a passar pelo leitor
      de execução e pela porta, dois lugares a mais para um segredo aparecer. Por isso a porta
      continua `{credential, payload}` e há caso cobrindo que o token não aparece no outcome.
      Verificação: vermelho (3 falhas: `CallbackUrl` indefinida e `provider_not_configured` chegando
      como `credential_unreadable`), depois verde.
- [x] **T008** — `nfse-fiscal-gateway.ts`: `callbackBaseUrl` entra em `NfseFiscalGatewayConfig`,
      `resolveClient` passa a devolver `{callbackToken, client}` e o ramo condicional
      `callbackUrl === undefined ? {} : …` sai. `NFSE_CALLBACK_BASE_URL` entra no schema de env do
      worker com validação https (ou http em localhost, para a máquina), e o caminho é cópia por
      valor do `API_PUBLIC_NFSE_CALLBACKS_PATH` da API.
      Verificação: T007 verde (8 pass / 0 fail), `environment.contract` 18 pass / 0 fail, suíte do
      worker 466 pass / 0 fail, `typecheck` e `lint` do worker limpos.
- [ ] **T009** — `NFSE_CALLBACK_BASE_URL` na `api` **e no `worker`** de produção, via
      `railway variables --set --skip-deploys`, e confirmar que a rota de retorno passa a ser
      registrada. `.env.example` declara a variável.
      Os dois serviços, não só a `api`: a `api` precisa dela para registrar a rota do postback e o
      `worker` para montar a `CallbackUrl` do `/emitir`. Configurar um sem o outro é emitir sem
      retorno ou publicar rota que ninguém chama.
      Feito: variável gravada nos dois com
      `https://api.fernandes-transportadora.com.br` (origem pública do serviço `api`), e conferida
      por `railway variables --kv | grep`. **Falta** o registro da rota, que só acontece no próximo
      deploy — `--skip-deploys` não reinicia a instância em execução.
      Verificação: `railway variables --kv` mostrando a chave e o boot registrando a rota.

## Fase D — fechamento

> 🤖 Modelo: `sonnet`

- [x] **T010** — `make check` nas apps tocadas, `make migration-test`, e a auditoria de go-live: o
      token não aparece em log em nenhum nível, a resposta de erro não vaza corpo do provedor, e a
      sondagem não deixou segredo em histórico de shell.
      Verificação: gates e auditoria no `evidence.md`. Os três pontos passam; a auditoria devolveu um
      achado (a redação cobre só um dos dois segredos do pedido), que virou a T022. ⚠️ `make check`
      fecha em `format:check` por dois arquivos da **041**, em edição por outra sessão na mesma
      árvore — os da 040 passam.
- [x] **T011** — `docs/SECURITY.md` ganha o item datado do `X-Signature` não verificado (o postback é
      autenticado só pelo token opaco no caminho), ao lado do rate limit que já está lá.
      `CLAUDE.md` registra que a inscrição municipal é obrigatória e que `CallbackUrl` não é
      opcional.
      Verificação: os dois arquivos atualizados. O achado do postback ficou melhor do que "não
      verificamos a assinatura": a coleção oficial mostra os quatro exemplos de retorno saindo com um
      **único** cabeçalho (`Content-Type`), então **não há assinatura para verificar** — e o que
      limita o estrago é o postback ser gatilho, com corpo não lido e 204 invariável. O `CLAUDE.md`
      ganhou também as duas divergências ainda abertas (T020 e T021), para quem chegar depois não
      reimplementar a partir do código.

## Fase E — o que a documentação oficial abriu

> 🤖 Modelo: `sonnet` — T021 é 🧠, mexe no que se arquiva como documento fiscal

Duas tarefas nascidas da leitura do `changelog (v2).md`, depois que a Fase D foi escrita. Nenhuma
delas bloqueia a primeira emissão; a T021 bloqueia a **liquidação** dela.

- [x] **T020** — O `motivo` do cancelamento passa a ser código (`1` · `2` · `4`), não o texto livre
      do operador. A porta de cancelamento deixa de receber `reason: string` e passa a receber o
      código; o texto do operador, se houver de continuar existindo, é outro campo — os dois não
      cabem no mesmo. Atenção ao código `1`: a própria documentação diz que ele **recusa** o
      cancelamento pedindo para usar a substituição, então oferecê-lo na tela sem explicar isso é
      montar um caminho que sempre falha.
      No mesmo passo, confirmar contra a conta autenticada se o `id_nota` aceita string — sem essa
      confirmação, **não** converter (`Number()` cego vira `NaN` no corpo).
      Verificação: contrato vermelho antes; o corpo sai com o código e um caso negativo recusa texto
      livre. **Entregue:** o catálogo ficou com `2` e `4` — o `1` não é oferecido, e o texto do
      operador virou `cancellationReason`, que fica na nota e não atravessa a fronteira do provedor.
      O `id_nota` **segue como texto**: a sondagem da conta autenticada não aconteceu, e sem ela a
      conversão não entra. Ele volta com a T001/T002. **Atualização:** a T001/T002 aconteceu e não
      resolveu — a busca da conta não devolve nota alguma e `/xml/{nNFSe}` diz "Nota não encontrada",
      porque o `id_nota` é identificador interno do provedor e só aparece na resposta do `/emitir`. A
      confirmação passa a depender da primeira emissão real pelo nosso worker.
- [ ] **T021** 🧠 — `/xml` e `/pdf` devolvem o documento **em base64** (changelog da v2, endpoints
      novos). Hoje `readDocument` arquiva `arrayBuffer()` cru nas duas cópias — worker e cron —, o
      que grava o base64 como se fosse o documento. O XML é o documento fiscal e é ele que liquida a
      nota: arquivar texto base64 sob `application/xml` é perder o original sem nenhum erro no
      caminho.
      Sondar a conta autenticada **antes** de decidir a forma: falta saber se o base64 vem como
      corpo de texto puro ou dentro de envelope JSON — e o `readDocument` de hoje trata
      `content-type: application/json` como falha, então o segundo caso já falharia em silêncio.
      Verificação: contrato vermelho nas duas cópias (`nota-rp-parity.contract.ts` guarda a
      paridade); XML arquivado abre como XML.
      **Sondagem da T001/T002:** só deu para ver a resposta de **falha** — `/xml/{nNFSe}` volta `200`
      com `content-type: application/json` e `{"success":false,"message":"Nota não encontrada"}`, que
      é o caminho que o `readDocument` já trata como falha. A resposta de **sucesso** continua sem
      amostra, porque nenhuma nota da conta é alcançável sem o `id_nota` interno. Depende, como o
      resto, da primeira emissão pelo worker.
- [x] **T022** — A redação do cliente do worker cobre **um** dos dois segredos que viajam no pedido.
      `redact` corta só `config.token`; o `callbackToken` vai dentro da `CallbackUrl` no corpo do
      `/emitir`, e o cliente sequer o conhece. Se a prefeitura devolver a URL na `message` de uma
      recusa de validação — plausível, e é justamente o caso em que a URL é o assunto —, o token de
      callback é gravado em claro na rejeição da nota.
      Passar o `callbackToken` para o `NotaRpV2Config` e cortar os dois. Achado da auditoria da T010;
      não bloqueia a emissão.
      Verificação: contrato vermelho — `message` de recusa contendo a `CallbackUrl` inteira sai com o
      token substituído. **Feito.** Dois testes novos em `nota-rp-v2-client.contract.test.ts`, um por
      caminho de mensagem — a recusa do `/emitir` e a `mensagem_erro` da consulta —, vermelhos antes
      (`Received: "CallbackUrl invalida: …/notarp-v2-synthetic-callback-token-do-not-leak"`) e verdes
      depois: `468 pass · 0 fail` no worker (eram 466). O `callbackToken` entrou no `NotaRpV2Config`
      como campo **obrigatório**, e `redact` passou a dobrar sobre uma lista de segredos, filtrando o
      vazio — cortar string vazia partiria a mensagem inteira entre `[REDACTED]`. A cópia do cron
      **não** recebeu o campo, e isso é deliberado: `grep -n 'CallbackUrl\|callback'` nos dois
      arquivos dela não devolve nada, porque ali só se consulta e se baixa documento — não há segundo
      segredo a redigir. `typecheck` e `lint` limpos nas quatro apps.
- [ ] **T023** — "Nota não encontrada" chega ao `fetchStatus` como `malformed_response`. O provedor
      responde `200` com `success: true`, uma `message` e **sem** a chave `data`; o cliente faz
      `asRecord(envelope.data['data'])`, não acha, e classifica como resposta malformada. É a causa
      errada para o caso mais banal do trilho, e some no meio das falhas de contrato quando a
      reconciliação olhar o motivo. Dar causa própria (`not_found`) nas duas cópias — worker e cron.
      Achado da sondagem da T001/T002; não bloqueia emissão.
      Verificação: contrato vermelho antes, nas duas cópias, com o envelope sem `data`.
