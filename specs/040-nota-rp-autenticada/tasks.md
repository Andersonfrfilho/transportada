# 040 — A Nota RP autenticada de verdade · tasks

Uma task por vez. Task só fecha com evidência em `evidence.md`.
Contrato antes da implementação, sem exceção — foi a falta dele que deixou o defeito passar.

## Fase 0 — sondar antes de escrever

> 🤖 Modelo: `sonnet`

- [ ] **T001** — Sondagem manual contra `/dados-cadastrais` com a credencial real **e** com token
      inventado, mandando `X-AUTH-USER-TOKEN` + `X-AUTH-IM`. Confirmar que o caminho válido passa a
      trazer `cadastro` preenchido (hoje vem `null` por falta do `X-AUTH-IM`) e que o inválido
      devolve 401. Registrar de passagem se `operacoes_permitidas` chega, porque é dela que saem os
      valores válidos de `ExigibilidadeISS`.
      O token entra por variável de shell e **não** é impresso; a saída colada no `evidence.md` vai
      sem ele.
      Verificação: as duas saídas, lado a lado, no `evidence.md`.
- [ ] **T002** — Com a mesma sondagem, decidir o `X-Auth-CNPJ`: mandar com e sem, e comparar. Se não
      mudar nada, fica fora e a razão vai para o `README.md` da doc no pacote fiscal, que hoje
      registra a dúvida em aberto.
      Verificação: as duas respostas no `evidence.md` e a nota atualizada no pacote.

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

- [ ] **T016** — `[NEEDS CLARIFICATION]` A tabela de códigos de `motivo` do cancelamento. A coleção
      mostra `"2"` sem legenda e a descrição do endpoint é uma linha só; hoje mandamos o texto livre
      que o operador digitou. Resolver junto com a sondagem da Fase 0 (a conta autenticada é a única
      fonte) e só então mapear valor. **Bloqueia o valor, não a rota.**
      Verificação: a tabela no `evidence.md`, com a origem.
- [ ] **T017** — Contrato: o cancelamento bate em `/cancelar-nota` e o corpo sai com a chave `motivo`.
      Verificação: vermelho.
- [ ] **T018** — `ROUTE_CANCEL` e o corpo do cancelamento no cliente do worker. O **valor** continua
      sendo o texto do operador até a T016 fechar — trocar rota e chave já é o que separa "recusado
      pela prefeitura" de "404 em silêncio".
      Verificação: T017 verde.
- [ ] **T019** — O cliente do cron para de ler `code` do corpo da recusa (linha 153): o envelope da
      v2 é `{success:false, message}`, e ler um campo que nunca vem é a inferência que a A2 desfez do
      outro lado. `nota-rp-parity.contract.ts` passa a cobrir a recusa sem código nas duas cópias.
      Verificação: vermelho e depois verde nas duas apps.

## Fase B — a inscrição municipal deixa de ser opcional

> 🤖 Modelo: `sonnet` — T006 é 🧠, tem migration

- [ ] **T005** — Contrato: `saveCredentialSchema` recusa corpo sem `municipalRegistration` e recusa
      string vazia; o teste de tenant-safety do schema de NFS-e continua verde.
      Verificação: vermelho.
- [ ] **T006** 🧠 — Tirar o `.default('')` do `saveCredentialSchema`, migration versionada pondo a
      coluna `not null` com `rollback.sql` ao lado. Conferir antes que não há linha selada em nenhum
      ambiente — em produção não há, e é por isso que a hora é agora.
      Verificação: T005 verde e `make migration-test`.

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
- [ ] **T009** — `NFSE_CALLBACK_BASE_URL` na `api` de produção, via
      `railway variables --set --skip-deploys`, e confirmar que a rota de retorno passa a ser
      registrada. `.env.example`
      declara a variável.
      Verificação: `railway variables --kv` mostrando a chave e o boot registrando a rota.

## Fase D — fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T010** — `make check` nas apps tocadas, `make migration-test`, e a auditoria de go-live: o
      token não aparece em log em nenhum nível, a resposta de erro não vaza corpo do provedor, e a
      sondagem não deixou segredo em histórico de shell.
      Verificação: saída dos gates no `evidence.md`.
- [ ] **T011** — `docs/SECURITY.md` ganha o item datado do `X-Signature` não verificado (o postback é
      autenticado só pelo token opaco no caminho), ao lado do rate limit que já está lá.
      `CLAUDE.md` registra que a inscrição municipal é obrigatória e que `CallbackUrl` não é
      opcional.
      Verificação: os dois arquivos atualizados.
