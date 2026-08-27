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
