# ADR-0036: `company-admin` emite NFS-e — segunda emenda ao item 2 do ADR-0003

- Status: aceito
- Data: 2026-08-17
- Decisores: mantenedor do projeto

## Contexto

Em produção, com as notas selecionadas e "Emitir NFS-e" clicado, o diálogo ficava em esqueleto
eterno. A verificação no navegador da instalação real mostrou o que acontecia: ao abrir o diálogo,
**nenhuma requisição saía** — nem `GET /nfse-emission-profiles/options`, nem
`POST /nfse-service-invoices/preview` — e nove esqueletos ficavam girando.

A causa é uma matriz que abre a porta e tranca a sala:

- o botão "Emitir NFS-e" aparece com `nfse.manage` (`canOpenNfseEmission`), que o `company-admin`
  tem;
- a lista de perfis exige `nfse.issue` (`nfse-emission-profiles.routes.ts`), que ele **não** tinha;
- sem perfil não há `profileId`, e a query da prévia nunca liga, porque `enabled` depende dele.

`nfse.manage`, aliás, não guarda rota nenhuma na API: ela existe só para decidir se o botão aparece.

O ADR-0026 já corrigiu exatamente esta forma de defeito no faturamento — "o resultado prático da
matriz antiga era um botão morto, não uma separação de responsabilidades". Aqui o botão morto voltou
um passo adiante do que aquele ADR consertou: quem gera a fatura (`billing.create`, dado ao
`company-admin` pelo ADR-0026) não podia emitir a nota de serviço daquilo que faturou.

## Decisão

1. `company-admin` passa a receber `nfse.issue` e `nfse.cancel`, além do `nfse.manage` e do
   `nfse.read` que já tinha. O item 2 do ADR-0003 e o item 2 do ADR-0026 ficam emendados nesta parte.
2. A emissão de **CT-e e MDF-e continua negada** ao `company-admin` (`cte.issue`, `cte.cancel`,
   `mdfe.issue`, `mdfe.close`, `mdfe.cancel`). A assimetria é deliberada e está justificada abaixo.
3. O gate do botão continua em `nfse.manage`. Quem tem `nfse.manage` sem `nfse.issue` — hoje o
   `operator` — abre o diálogo e lê por que não pode emitir, em vez de não ver o botão. Foi escolha
   de descobribilidade: a mensagem ensina qual acesso falta, e o botão sem função é o custo aceito.
4. O diálogo deixa de mentir. `resolveNfseEmissionStatus` passa a receber `isPreviewEnabled` — a
   mesma condição que liga a query — e um `profileStatus` próprio, com os estados `profileMissing`,
   `profileError` e `profileUnavailable`. Esqueleto só enquanto existe requisição em voo.
5. A matriz continua congelada em contrato (`test/authorization.contract.test.ts`): ampliar papel
   exige alterar o contrato junto do código.

## Por que NFS-e sim e CT-e não

Não é o rótulo "fiscal" que decide, é o dano de um erro e quem o desfaz.

O CT-e e o MDF-e vão para a SEFAZ, prendem-se a uma viagem em curso e o cancelamento tem janela
curta e regra própria; um lote emitido por engano é dano operacional real, e é por isso que o
ADR-0026 parou ali.

A NFS-e é a contrapartida da fatura que o `company-admin` já emite por decisão do ADR-0026: ela
nasce **do que ele mesmo faturou**, é municipal, e o cancelamento é rota do produto
(`nfse.cancel`, que entra junto pelo mesmo motivo do ADR-0026 — quem gera precisa desfazer o próprio
erro). Separar as duas coisas deixava a instalação de operador único com metade do fluxo de cobrança
acessível: gerava a fatura e não emitia a nota de serviço dela.

## Consequências

- A instalação de operador único — que é o formato de distribuição do produto (ADR-0021) — emite
  NFS-e sem acumular papéis.
- `company-admin` fica mais perto ainda de superusuário operacional. O limite que sobra é a emissão
  de documento de transporte, que é onde o dano é irreversível perante a SEFAZ.
- `fiscal` continua com o mesmo conjunto: quem separa funções não muda de comportamento.
- `operator` continua sem emitir, e agora **sabe disso ao clicar**, em vez de esperar para sempre.
- `nfse.manage` segue sem rota consumidora na API. Ela é gate de interface, e está registrado aqui
  que é isso que ela é — não uma permissão de escrita.

## Segurança e rollback

A permissão continua nascendo apenas das roles da membership ativa no PostgreSQL, nunca de claims de
role do JWT. As rotas de NFS-e não mudaram de política: `nfse.issue` segue exigida em
`nfse-invoices.routes.ts` e em `nfse-emission-profiles.routes.ts`, e o escopo continua `company`.

Rollback é remover as duas entradas de `COMPANY_ROLE_PERMISSIONS['company-admin']` e do contrato. Não
há migration nem dado persistido envolvido: a resolução é em memória, a cada request. A correção do
esqueleto é independente e não precisa voltar junto — sem `nfse.issue` o diálogo passa a dizer que o
acesso não permite listar os perfis, que é a verdade.

## Pendência conhecida (fora do escopo desta decisão)

Continua valendo a do ADR-0026: a listagem de CT-es está atrás de `cte.submit`, uma permissão de
escrita, quando deveria bastar `cte.read`.
