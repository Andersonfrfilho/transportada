# Evidência

Uma seção por task, na ordem em que ela fechou. Cada uma leva o comando rodado e a saída dele —
relatório de agente não é evidência, execução é.

⚠️ Duas provas desta spec são **por mutação**, não por leitura: o CA05 (chave sem entrada no mapa
reprova `bun run typecheck`) e qualquer contrato de visibilidade que afirme código por texto. Colar a
reprovação e o verde do desfazer.

## Levantamento inicial (feito ao escrever a spec, 2026-10-01)

Medido no worktree `fervent-sutherland-937527`, contra `origin/staging` em `bf2a1c432`:

- **O menu não filtra por permissão.** `NAVIGATION_GROUPS.map` (`main.tsx:654`) e `group.items.map`
  (`:680`) renderizam tudo. O único `permissions` do arquivo (`:507`) serve ao redirecionamento do
  motorista.
- **19 itens em 5 grupos**: Fiscal 10, Operações 2, Cadastros 4, Usuários 2, Administração 1.
  `driver-trip` e `notification` ficam fora dos grupos (`:134`, `:137`).
- **15 páginas têm parede de permissão própria**; **Empresa** e **NFS-e** não têm.
- **O separador abre 5 dos 19**: NF-e (`invoices.read`), Viagens (`fleet.read`), Ocorrências
  (`fleet.read`), Frota (`fleet.read`), Pendências (`fleet.read`).
- **`'billing.read'` é declarada como constante local em 5 arquivos** do módulo de faturamento — o
  sintoma de não existir mapa.
- **Conta de campo entra no painel por qualquer caminho que não seja `/minha-viagem` ou a raiz**:
  `resolveDriverAppRedirect` calcula `isDriverEntry` só com esses dois (`driverAppRedirect.service.ts:33`)
  e devolve `stay` para o resto.
- **`GET /auth/me` devolve `roles` validados** (`useAuthMe.query.ts:153`, `isLiteralArray(roles,
COMPANY_ROLES)`), o que torna a preferência de aterrissagem da RF-C6 implementável sem rota nova.
- **A fonte dos papéis** é `COMPANY_ROLE_PERMISSIONS`
  (`api-transportada/src/identity/domain/authorization.policy.ts:115`): `separator` tem
  `invoices.read`, `fleet.read`, `trip.read`, `trip.manage`, `cargo.measure`; `driver` e `aggregate`
  têm `trip.read` + `trip.report`.

Contexto de origem: investigação do relato de produção de 2026-10-01 ("os botões de CT-e não podem
aparecer para quem carrega"). A causa daquele relato era a conta ter `operator` **e** `separator`, e
as permissões somarem — resolvida por troca de papel. Esta spec trata o que sobrou.

## T1.1 — …

(a preencher pela execução)
