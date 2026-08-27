# 063 — o cliente tem portal · evidência

## T001 — ADR-0050 e a spec sem cláusula em aberto

`docs/adr/0050-o-cliente-tem-portal.md`, e as quatro `[NEEDS CLARIFICATION]` da spec respondidas.

## T002 — o vínculo do contratante com o documento

**Mudança de desenho, decidida pelo cliente em 2026-08-27, no meio da task:** o acesso deixou de ser
código de uso único anônimo e passou a ser **conta de usuário**. A ADR-0050 §2 foi reescrita e as
tabelas `client_access_codes` / `client_portal_sessions`, que chegaram a ser escritas, foram
descartadas antes de gerar migration — não há migration morta no repositório.

O que entrou:

- papel `contractor` em `COMPANY_ROLES` (e, por derivação, no CHECK do convite — contratante se
  convida, ao contrário do `automation`), com a permissão única `deliveries.track`;
- `contractor_portal_bindings` — membership ↔ `contractors`, com `company_id` nas **duas** FKs
  compostas, porque a FK simples aceitaria amarrar a conta de uma empresa ao contratante de outra;
- `trip_location_pings` — `on delete cascade` nas duas pontas, que é o que torna o expurgo do rastro
  consequência de fechar a viagem em vez de rotina que alguém esquece de rodar;
- `fleet_drivers.location_sharing_consent_at`, anulável e sem `default` — um `default now()` teria
  dado consentimento de toda a frota numa migration.

Comandos executados:

```
bun run typecheck                                                     # limpo
bun test ./test/contractor-portal-schema.contract.test.ts \
        ./test/authorization.contract.test.ts \
        ./test/identity-schema.contract.test.ts \
        ./test/separator-role.contract.test.ts \
        ./test/fleet-domain.contract.test.ts                          # 111 pass / 0 fail
make migration-test                                                   # 86 pass / 0 fail
```

Três contratos existentes reprovaram, como deviam, e foram atualizados com o porquê:
`authorization.contract.test.ts` (a matriz por extenso), `identity-schema.contract.test.ts` (a lista
de papéis e o CHECK) e `fleet-domain/person-name.contract.ts` (o registro completo do motorista).

### Buracos declarados

- **Ninguém lê `trip_location_pings` ainda** — a tabela existe, o expurgo é por `cascade`, mas a
  ingestão (T008) e a leitura no portal (T010) não chegaram. Até lá o consentimento do motorista não
  tem onde ser dado.
- **O vínculo não tem rota** — T004. Hoje ele só se cria por SQL, e por isso nenhuma conta de
  contratante existe em ambiente nenhum.

## T003 — o recorte do contratante

O escopo é **derivado da conta**: `resolveContractorScope` é a única fonte, e ela recebe vínculo, não
filtro. Não existe assinatura no módulo por onde um documento vindo da requisição entre no caminho —
e o contrato confere isso por texto de fonte, porque a falha aqui compilaria e passaria em todo teste
de caminho feliz, aparecendo só no dia em que alguém mandasse o CNPJ do vizinho.

Quatro decisões que ficaram escritas no código:

- **conta sem vínculo é 403, não lista vazia.** Lista vazia faria o portal parecer funcionando e a
  pessoa concluir que não tem entrega nenhuma;
- **documento em branco no cadastro não vira escopo** — casar com string vazia alcançaria participante
  sem documento, que é a nota de terceiro que este recorte existe para não mostrar;
- **os dois papéis contam** (`emitter` e `recipient`): restringir ao destinatário deixaria de fora a
  indústria que contrata o frete para entregar na loja do cliente dela, que é o caso mais comum;
- **o `join` com a viagem é `left`** — nota importada e ainda parada é "recebida", não ausência —, e
  ele exclui o vínculo com `released_at`: nota desvinculada volta a ser nota sem viagem.

Comandos executados:

```
bun run typecheck                                                     # limpo
bun run lint                                                          # limpo
bun test ./test/contractor-portal.contract.test.ts                    # 8 pass / 0 fail
DATABASE_URL=… bun test ./test/integration/contractor-portal.integration.ts   # 3 pass / 0 fail
```

A integração prova contra Postgres o que só o banco prova: a nota do vizinho existe na mesma empresa
e **não aparece**; a nota sem viagem aparece; a desvinculada volta a `null`; e inativar o contratante
fecha o portal da conta dele.

### Buracos declarados

- **Ainda não há rota** — T005. O use case existe e é testado, mas nada o chama, então nenhum
  contratante alcança nada por HTTP.
- **Sem cursor**: o teto é `CONTRACTOR_DELIVERY_LIMIT = 100`, sem paginação. Contratante com mais de
  cem notas no período vê as cem mais recentes e **não é avisado disso** — quando aparecer, é cursor
  igual ao da tabela de CT-es.

## T004 — administrar o vínculo

Três rotas em `/contractors/:id/portal-users`, todas sob **`users.manage`** — e não `settings.manage`.
São decisões diferentes que moram na mesma tela: administrar o cadastro do contratante decide **para
quem se cobra**; amarrar uma conta a ele decide **quem enxerga a operação**. O contrato reprova
`settings.manage` de propósito.

Duas guardas no repositório:

- **só membership com o papel `contractor` pode ser amarrada** (`409
CONTRACTOR_PORTAL_ROLE_REQUIRED`). Amarrar um operador não daria acesso nenhum — `deliveries.track`
  não está no papel dele —, e é justamente isso que faz o erro valer: quem tentou acreditaria ter
  concedido acesso, e ninguém descobriria até o cliente ligar dizendo que não entra;
- **amarrar duas vezes é o mesmo vínculo** (`onConflictDoNothing`), porque quem administra clica de
  novo quando a rede some.

Comandos executados:

```
bun run typecheck                                # limpo
bun run lint                                     # limpo
bun run test                                     # 3507 pass / 0 fail / 19 skip
bun run test:integration                         # 166 pass / 0 fail / 4 skip
```

Quatro contratos existentes reprovaram e foram atualizados com o porquê: o CHECK do convite
(`user-invitation-schema`, que agora aceita `contractor` — contratante se convida) e as duas listas
de colunas do motorista (`fleet-schema/drivers`, pelo consentimento anulável).

⚠️ A primeira rodada de `test:integration` acusou uma falha em "drains and exits cleanly on SIGTERM";
era **do ambiente da sessão** (o subprocesso herda `process.env`, e faltavam `KEYCLOAK_ADMIN_*`), não
do código. Com o `.env` do repositório carregado, passa.

### Buracos declarados

- **Não há tela** — criar o contratante-usuário hoje é convidar por `/company-users` com o papel
  `contractor` e depois chamar `POST /contractors/:id/portal-users` na mão. A tela entra com o
  frontend (T009–T010).
- **`GET /client/me/deliveries` continua sem existir** (T005): o contratante já pode ser amarrado,
  mas ainda não tem o que abrir.

## T005 — `/client/me/deliveries`

Uma rota, sob `deliveries.track`, escopo `company`. Ela **não recebe id de nada** — nem de nota, nem
de viagem, nem de contratante — e nem lê query: filtrar por documento é a única coisa que ela nunca
vai oferecer. Não há BOLA a testar porque não há objeto que o cliente possa nomear.

O payload é lista fechada, e o contrato compara **as chaves por extenso**: campo novo no tipo interno
não vaza para o portal sem alguém decidir, por escrito, que ele pode sair. O que ficou de fora:

- **id interno** de nota, de viagem e de vínculo — a chave de acesso já identifica a nota para quem é
  dono dela, e um UUID nosso na mão do cliente é identificador para tentar em outra rota no dia em
  que alguma aceitar id;
- **motorista, placa e roteiro** — é a operação da transportadora. Saber que a mesma carreta leva a
  carga do concorrente é informação comercial de graça;
- **valor de frete** — o que o contratante paga está na fatura dele.

Comandos executados:

```
bun run typecheck                                # limpo
bun run lint                                     # limpo
bun test ./test/contractor-portal.contract.test.ts   # 17 pass / 0 fail
bun run test                                     # 3512 pass / 0 fail / 19 skip
```

`docs/SECURITY.md` ganhou a seção do portal: a rota **não tem limite de requisição**, como o resto
desta API — o que muda é que agora existe conta legítima na mão de alguém de fora. O que ele lê é o
que já é dele, então o custo é de disponibilidade; o desfecho é o mesmo limitador que as rotas de
senha esperam.

### Buracos declarados

- **Sem integração de ponta a ponta pela rota**: o recorte é provado contra Postgres na T003 (pelo
  repositório) e a serialização no contrato de rota. Falta o teste que atravessa os dois com sessão
  de verdade — ele entra com o E2E da T011.
- **Sem cursor**, ainda: cem linhas por chamada, e o contratante com mais notas não é avisado.
