# ADR 0035 — A NFS-e tem um ambiente só, e ele é produção

- Status: aceito
- Data: 2026-08-14
- Decisores: mantenedor do projeto e revisão Opus
- Emenda: [ADR 0029](0029-nfse-municipal-via-nota-rp-v2.md), que segue valendo no resto

## Contexto

A configuração do trilho de NFS-e exige hoje um par de endereços — `NFSE_PROVIDER_BASE_URL_HOMOLOGATION`
e `NFSE_PROVIDER_BASE_URL_PRODUCTION` — e o schema recusa o boot se só um estiver declarado
(`cron-transportada/src/config/environment.schema.ts`, `worker-transportada/src/config/environment.schema.ts`).
O tudo-ou-nada foi escrito para impedir emissão contra o ambiente errado, pelo molde dos outros dois
trilhos fiscais.

Ao configurar o deploy descobriu-se que o par nunca foi preenchido — em nenhum serviço, em nenhum
ambiente. O trilho de NFS-e jamais rodou. Procurando o valor, três fontes concordam:

1. A documentação pública da Nota RP (`https://www.notarp.com.br/docs/swagger.yaml`, OpenAPI 3.0)
   declara **um único** `servers[]`: `https://www.notarp.com.br`, descrito como "Servidor de Produção".
   O documento inteiro não menciona sandbox, homologação ou teste. Ele descreve a v3.
2. A coleção oficial de desenvolvedores da **v2** — a versão que este produto usa, por decisão da
   ADR-0029 — declara `baseUrl = https://www.notarp.com.br/api/v2`, valor único. Os caminhos batem
   com o adaptador: `/notas/?id_nota=`, `/pdf/:id_nota`, `/xml/:id_nota`. O `leia-me.md` que a
   acompanha só usa "teste" no sentido de exercitar a API pelo Postman.
3. O que a coleção parametriza como separação é `token` e `inscricao_municipal` — a credencial, não
   o endereço.

E esta instalação tem **um cadastro só** na Nota RP.

Disso decorre que o par de variáveis modela uma distinção que o provedor não oferece. Preenchê-lo com
o mesmo host dos dois lados satisfaria o schema e produziria o oposto do que ele protege: `staging`,
que roda com `FISCAL_ENVIRONMENT=homologation`, passaria a falar com a Nota RP real, com a credencial
real, contra o cadastro real. A garantia seria cerimônia — o schema atestaria um isolamento que não
existe em lugar nenhum abaixo dele.

## Decisão

1. **Um endereço só.** O par vira `NFSE_PROVIDER_BASE_URL`, uma variável, sem chave por ambiente
   fiscal. `FISCAL_ENVIRONMENT` continua existindo e continua selecionando ambiente de CT-e e MDF-e,
   onde a SEFAZ de fato mantém homologação; ele deixa de escolher endereço de NFS-e, porque não há o
   que escolher. O valor continua vindo do ambiente, nunca cravado em código.

2. **A NFS-e é um trilho de produção.** Com um cadastro só, não existe forma de exercitar a emissão
   fora de produção sem emitir nota de verdade. `cron-nfse` não sobe fora de produção, e o passo dele
   no `deploy.yml` passa a ser condicionado a produção — o inverso do que está lá hoje, que é um
   contorno temporário de quando o serviço ainda não existia no ambiente.

3. **Falha no boot continua sendo a resposta.** Job de NFS-e declarado sem `NFSE_PROVIDER_BASE_URL`
   derruba o processo, como já derrubava sem chaveiro e sem bucket. O que muda é a condição, não a
   postura: some o ramo de meia-configuração, que agora é inalcançável.

4. **O isolamento real é a credencial.** Ela já é selada por empresa com AAD
   `transportada:nfse-credential:v1:${companyId}:${credentialId}` (ADR-0029, ADR-0004). É ali que
   staging e produção se separam de verdade, e é ali que a separação deve ser afirmada por teste — não
   por uma URL que é a mesma para todo mundo.

## Alternativas rejeitadas

**Preencher as duas com o mesmo host.** Zero linhas de código e o deploy destrava hoje. Mas deixa em
pé um schema que promete o que não pode cumprir, e a próxima pessoa a ler `_HOMOLOGATION` vai concluir
que existe um ambiente de teste e agir de acordo. Uma garantia falsa é pior que garantia nenhuma:
ninguém audita o que já parece resolvido.

**Manter o par e apontar homologação para um mock nosso.** Daria um alvo de staging sem tocar em nota
real. Mas o que se exercitaria é o nosso mock — o valor de um ambiente de homologação está em falar
com o sistema do outro lado, e esse não existe. Mock é teste de contrato, e o lugar dele é
`test/nfse-status-pull/nota-rp-parity.contract.ts`, onde já está.

**Deixar como está e nunca ligar a NFS-e.** É o estado de hoje por omissão, não por decisão. A ADR-0029
existe porque o trilho é necessário; adiar indefinidamente só mantém o operador redigitando no portal.

## Consequências

- `staging` fica **sem** NFS-e, declaradamente. A reconciliação roda só em produção, e o primeiro
  exercício do trilho é contra nota real — o que torna o cuidado da primeira emissão uma questão de
  processo, não de ambiente.
- Some o único consumidor de `FISCAL_ENVIRONMENT` no `cron-nfse`. A variável permanece por causa dos
  outros trilhos; um teste deve fixar que o job de NFS-e não a lê mais, senão ela volta por hábito.
- `.env.example` perde duas linhas e ganha uma. As oito cópias de schema entre worker e cron
  (documentadas no `CLAUDE.md`) precisam mudar juntas.
- O teto de `Discriminacao`, que a ADR-0029 deixou para "medir com a credencial real antes de emitir
  em volume", agora só pode ser medido em produção. Ele fica valendo 2000 (ABRASF) até haver medida.

## Segurança e rollback

Nada muda no selo da credencial nem no que sai em log — a mudança é de configuração e de schema de
boot. O risco que esta ADR remove é o de staging apontar para a Nota RP real; o risco que ela aceita é
o de a primeira emissão ser em produção, e ele é mitigado por emitir uma nota única, conferida no
portal, antes de qualquer volume.

Reverter é reintroduzir o par e voltar o passo do `deploy.yml` para staging. Como nenhuma migration
está envolvida, a reversão é uma mudança de código e de variável, sem estado a desfazer.

Guardam a decisão: o contrato de ambiente do cron
(`apps/cron-transportada/test/notification-schedules/environment.contract.ts` e o de NFS-e ao lado), o
contrato equivalente do worker, e a paridade de tradução em
`apps/cron-transportada/test/nfse-status-pull/nota-rp-parity.contract.ts`.
