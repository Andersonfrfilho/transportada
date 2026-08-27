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
