# Evidência — Feature 175

## Fase 1 — A permissão que diverge

### T001 — Contrato antes da correção

`apps/frontend-transportada/test/nfse-invoice/emission-dialog.contract.ts`: o teste
`opens the bulk action only for who manages service invoices` foi reescrito para exigir
`nfse.issue` (e negar `nfse.manage` isolado), e foi acrescentado
`gates the same permission the POST /nfse-service-invoices route requires`, que lê
`apps/api-transportada/src/nfse-invoices/presentation/nfse-invoices.routes.ts` e confirma
`policy: NFSE_ISSUE_POLICY` na rota de criação.

Rodado **antes** da correção, contra o gate ainda em `nfse.manage`:

```
$ bun test ./test/nfse-invoice.contract.test.ts
(fail) nfse emission action permission contract > opens the action only for who can issue service invoices
  Expected: true / Received: false   (canOpenNfseEmission(['nfse.issue']))
(fail) nfse emission action permission contract > gates the same permission the POST /nfse-service-invoices route requires
  Expected: true / Received: false
273 pass
2 fail
```

Confirmado: o contrato falha exatamente pelo motivo esperado (gate ainda pedindo `nfse.manage`).

### T002 — Correção

`canOpenNfseEmission` em `nfseEmission.service.ts:100-102` trocou `NFSE_MANAGE_PERMISSION` por
`NFSE_ISSUE_PERMISSION`. Comentário correspondente em `NfseEmissionAction.component.tsx:37`
atualizado (citava `nfse.manage`).

`NFSE_MANAGE_PERMISSION` **não foi removida**: ela segue em uso legítimo em
`useNfseInvoices.hook.ts:77` (`canManageInvoices`, campo do controller, dimensão distinta de
emitir), sem relação com o gate de abertura do diálogo de emissão.

Depois da correção:

```
$ bun test ./test/nfse-invoice.contract.test.ts
275 pass
0 fail
1301 expect() calls
```

```
$ bun run typecheck
$ tsc --noEmit          (sem saída, sem erro)

$ bun run lint
$ eslint .               (sem saída, sem erro)
```

### T003 — Medição em bancada

**O que foi confirmado por código, não por suposição:** o cenário "só `nfse.manage`, sem
`nfse.issue`" já existe entre os papéis reais do produto — é exatamente o papel `operator`
(`apps/api-transportada/src/identity/domain/authorization.policy.ts:199-215`), que tem
`nfse.manage` e `nfse.read` mas **não** `nfse.issue`. O papel `company-admin` (linhas 115-141),
`finance` e `fiscal` têm as duas permissões juntas — não servem para isolar a divergência.

**O que ficou pendente de verificação manual, e por quê:** tentei abrir a stack local
(frontend `http://localhost:53020`, API `http://localhost:53021`) para logar como um usuário com
papel `operator` e confirmar visualmente que o botão de emissão de NFS-e não aparece mais, e como
um usuário com `nfse.issue` para confirmar que aparece. O único usuário seedado no realm local
(`realm/transportada-local-realm.json`, `local-user`) não carrega `realmRoles` — ele existe para o
provisionamento do primeiro `company-admin` (ADR-0021), que soma as duas permissões e não separa o
caso. Criar um segundo usuário/papel no Keycloak local para isolar o cenário é alteração de
configuração de identidade, fora do escopo desta task de verificação (T003 pede medir o que já
existe, não provisionar cenário novo). Registro isso como pendente em vez de inventar um "visto na
tela" que não aconteceu.

**Evidência que cobre o requisito sem a bancada:** o contrato T001 exercita a própria função de
gate (`canOpenNfseEmission`) com os dois conjuntos de permissão — `['nfse.manage']` (nega) e
`['nfse.issue']` (permite) — que é o comportamento que o papel `operator` veria na tela, e o
segundo teste amarra esse gate à política real da rota (`NFSE_ISSUE_POLICY`). A lacuna que sobra é
só a confirmação visual do 403 sumindo na UI, não a lógica.
