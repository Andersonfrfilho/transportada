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

- [ ] **T003** — Contrato: `nota-rp-parity.contract.ts` passa a exigir, nas **duas** cópias, que a
      requisição carregue `X-AUTH-USER-TOKEN` e `X-AUTH-IM` com os valores da credencial, e que não
      exista `authorization`; mais um caso que falha se a string `Bearer` aparecer no fonte de
      qualquer um dos dois clientes.
      Verificação: vermelho.
- [ ] **T004** — `buildHeaders` nos dois clientes (`worker-transportada/src/nfse-issuance/
      infrastructure/nota-rp-v2.client.ts:160` e `cron-transportada/src/nfse-status-pull/
      infrastructure/nota-rp-v2.client.ts:92`), na mesma task — são cópias por valor, e meio caminho
      deixa a reconciliação cega. A inscrição municipal precisa chegar até o cliente: hoje ela não é
      lida por nenhum dos dois.
      Verificação: T003 verde.

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

- [ ] **T007** — Contrato: o tipo de emissão exige `callbackUrl`, e existe caso cobrindo que o
      payload sai com `CallbackUrl` https. Emissão sem a URL não compila.
      Verificação: vermelho, e `bun run typecheck` acusando o caminho que hoje omite o campo.
- [ ] **T008** — `nfse-fiscal-gateway.ts`: `callbackUrl` deixa de ser opcional (linhas 113, 185, 210,
      224), e o ramo condicional `callbackUrl === undefined ? {} : …` sai. Ajustar quem constrói a
      chamada.
      Verificação: T007 verde.
- [ ] **T009** — `NFSE_CALLBACK_BASE_URL` na `api` de produção, via `railway variables --set
      --skip-deploys`, e confirmar que a rota de retorno passa a ser registrada. `.env.example`
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
