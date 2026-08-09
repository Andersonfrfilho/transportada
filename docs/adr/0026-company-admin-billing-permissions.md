# ADR-0026: `company-admin` fatura — emenda ao item 2 do ADR-0003

- Status: aceito
- Data: 2026-08-08
- Decisores: mantenedor do projeto

## Contexto

O ADR-0003 decidiu, no item 2, que `company-admin` recebe "gestão local, configurações, auditoria e
leituras, mas nenhuma emissão, cancelamento, importação ou faturamento por implicação". O item 3 deu
`billing.create`, `billing.cancel` e `billing.read` só ao `finance`. Aquilo foi escrito quando o
produto ainda se supunha SaaS multiempresa, onde uma transportadora grande separa quem opera de quem
fatura.

O ADR-0021 mudou a premissa: a distribuição é **instalação dedicada**, um deploy por transportadora,
e o `company-admin` é o dono do ambiente — foi por isso que ele já tinha ganho `invoices.import`.

O resultado prático da matriz antiga era um botão morto, não uma separação de responsabilidades:

- "Gerar fatura" na listagem de CT-es exige `billing.create`
  (`cte-batch/shared/cteBatchBilling.service.ts`), que o `company-admin` não tinha;
- a própria listagem de CT-es só carrega com `cte.submit`
  (`cte-batch/hooks/useCteItemTable.hook.ts`), que o `finance` não tem.

Nenhum papel sozinho alcançava o botão habilitado. Quem via a lista não podia faturar; quem podia
faturar não via a lista. Numa instalação de um CNPJ só, com um administrador, o faturamento ficava
inacessível sem acumular dois papéis manualmente.

## Decisão

1. `company-admin` passa a receber `billing.create` e `billing.cancel`, além do `billing.read` que já
   tinha. O item 2 do ADR-0003 fica emendado nessa parte: faturamento deixa de ser negado ao dono do
   ambiente.
2. O restante do ADR-0003 permanece: nada de emissão fiscal (`cte.issue`, `cte.cancel`, `mdfe.issue`,
   `mdfe.close`, `mdfe.cancel`) para `company-admin`, nada de permissão por implicação de nome, e
   toda permissão não declarada continua negada.
3. `finance` continua existindo com o mesmo conjunto, para quem quiser separar faturamento de
   operação numa instalação com mais de uma pessoa.
4. A matriz continua congelada em contrato (`test/authorization.contract.test.ts`): ampliar papel
   exige alterar o contrato junto do código.

## Consequências

- A instalação de operador único fatura sem acumular papéis.
- `company-admin` fica mais perto de superusuário operacional do que o ADR-0003 queria — o limite que
  sobra é a emissão fiscal, que é onde o dano é irreversível perante a SEFAZ.
- Cancelamento de fatura entra junto de propósito: quem gera precisa desfazer o próprio erro, e
  separar os dois deixaria um beco sem saída igual ao que esta emenda corrige.
- Instalações que já separam papéis não mudam de comportamento: quem for só `finance` continua com o
  mesmo acesso.

## Segurança e rollback

A permissão continua nascendo apenas das roles da membership ativa no PostgreSQL, nunca de claims de
role do JWT. As rotas de faturamento não mudaram de política — `billing.create` e `billing.cancel`
seguem exigidas em `billing/presentation/billing.routes.ts`.

Rollback é remover as duas entradas de `COMPANY_ROLE_PERMISSIONS['company-admin']` e do contrato. Não
há migration nem dado persistido envolvido: a resolução é em memória, a cada request.

## Pendência conhecida (fora do escopo desta decisão)

A listagem de CT-es está atrás de `cte.submit`, uma permissão de escrita, quando deveria bastar
`cte.read`. É o que impede o `finance` puro de faturar. Corrigir isso exige revisar o gate do
frontend e a política da rota de listagem, e fica para uma decisão própria.
