## cron-transportada

Processo **one-shot**: um CronJob sobe `src/main.ts` a cada janela, ele roda um ciclo e sai —
não há loop nem agendador embutido. Sai com código 1 só quando alguma empresa falhou; não pegar o
advisory lock é no-op limpo. A conexão Postgres é pinada em **um socket** (`max: 1`) para o lock de
sessão valer por todas as transações do ciclo.

O processo é **uma batida só** (`src/tick/tick.job.ts`), agendada a cada cinco minutos: pega o
advisory lock, lê `job_schedules`, publica em `job-run.v1` cada rotina com `next_run_at <= now()` e
avança a janela dela. `CRON_JOB` e `src/job-registry.ts` **não existem mais** — quem escolhe a rotina
é o relógio no banco, não a variável do painel de hospedagem, e por isso os quatro serviços de cron
viraram um (spec 052). ⚠️ As rotinas chegam ao worker uma por vez, e enquanto a dela não chega o
`src/<rotina>/<rotina>.job.ts` continua no cron **sem chamador** — hoje só `nfe.distribution.pull`
está nesse estado, e a fatia dela fica aqui até a última pousar do outro lado. As outras três já
foram: com a de **NFS-e** saíram as cinco cópias por valor do cliente da Nota RP, o schema de
reconciliação e o bloco de configuração dele (chaveiro, bucket e endereço da prefeitura não são mais
lidos nesta app); com a de **notificação** saíram o bloco `NOTIFICATION_SUPPRESSION_HMAC_KEY` e as
duas dependências `@adatechnology/notification-*`; e com a de **combustível** saíram os dois blocos
de agência (`ANP_*`, `ANEEL_*`), os dois schemas Drizzle do preço e o catálogo `FUEL_TYPES`, que hoje
é cópia da API, do frontend e do **worker**.

A rotina que ainda vive aqui:

- `nfe.distribution.pull` — seleciona as empresas elegíveis e enfileira uma importação
  `source: 'distribution'`, `triggeredBy: 'automation'` na `processing_outbox`, reusando o relay e o
  consumidor de distribuição que já existiam.

Do cron restou **uma** obrigação de configuração, e ela é dura: o endereço do broker
(`RABBITMQ_URL`, `QUEUE_PREFIX`) é **sempre** obrigatório — a batida sempre publica, e um cron que
não alcança a fila não teria o que fazer. Quem escolhe a rotina por presença de variável agora é o
worker, não esta app.

**O endereço da Nota RP é um só, e a NFS-e é trilho de produção** (ADR-0035). O provedor publica um
servidor (`https://www.notarp.com.br/api/v2`) e não tem homologação; quem separa uma instalação da
outra é a credencial selada por empresa, não a URL. Por isso `NFSE_PROVIDER_BASE_URL` substituiu o par
`_HOMOLOGATION`/`_PRODUCTION` — o teste que falha se os nomes voltarem é o do **worker**, única app
que ainda fala com a Nota RP — e `FISCAL_ENVIRONMENT` não escolhe mais endereço de NFS-e (segue
valendo para CT-e e MDF-e). `cron-nfse` não existe mais: a reconciliação é rotina do worker, que
publica nos dois ambientes.

**A Nota RP não autentica só pelo token, e não emite sem endereço de retorno** (spec 040). Toda
chamada leva **dois** cabeçalhos: `X-AUTH-USER-TOKEN` e `X-AUTH-IM`, a inscrição municipal do
prestador. Sem o segundo o provedor responde **200 com `cadastro: null`** — a credencial parece boa e
só se revela inválida na primeira emissão, longe de onde foi gravada. Por isso
`municipal_registration` é obrigatória em toda a fronteira: `.min(1)` no `saveCredentialSchema`, sem
`default` na coluna e com `check (length(...) > 0)`, e bloqueio na tela antes do 400 genérico
(`buildNfseCredentialSubmission`).

A emissão é **assíncrona** e o `CallbackUrl` https é **obrigatório** no corpo do `/emitir` — nota sem
ele não é aceita. A URL **não atravessa a porta de emissão**: ela é montada dentro do
`nfse-fiscal-gateway.ts` do worker, com `NFSE_CALLBACK_BASE_URL` mais o `callbackToken` opaco que sai
do envelope selado — quem abre o envelope é o gateway, uma vez por operação, e fazer o consumidor
montar a URL obrigaria o segredo a passar por dois lugares a mais. A variável vive na **api e no
worker**: o worker monta a URL, a api registra a rota. Do outro lado, `POST
/public/nfse-callbacks/{token}` é **gatilho, não fonte da verdade** — corpo não lido, 204 invariável,
e o estado real vem da consulta autenticada do cron. A Nota RP **não assina o postback** (achado
datado em `docs/SECURITY.md`).

**O cancelamento manda código, e o documento é conferido pela própria abertura.** `/cancelar-nota`
exige `motivo` como **código**: o catálogo oferece `2` (serviço não prestado) e `4` (nota duplicada)
— o `1` (erro na emissão) fica de fora porque o provedor o recusa pedindo substituição —, e o texto
do operador vira `cancellationReason`, que fica na nota e não atravessa a fronteira. Já `/xml` e
`/pdf` devolvem o documento **dentro de um envelope JSON** — medido em produção em 19/08/2026
(nota `5254907`): `application/json` com `{success:true, base64_file}`, e o corpo cru nunca aparece.
`readDocument` abre o envelope e entrega o `base64_file` a `resolveNfseDocumentBytes`
(`nfse-document-payload.policy.ts`, cópia por valor no worker e no cron), que confere a
**assinatura** — `<` abre XML, `%PDF` abre PDF, com espaço, quebra de linha e BOM tolerados antes —
e decodifica base64 quando ela não bate. Recusar o envelope inteiro, como antes, adiava para sempre
a nota **já autorizada**: o status liquidava e o download não. Corpo que não é o documento nem
base64 dele vira `malformed_response`, a causa que adia: sem o XML a nota não liquida.

**A consulta devolve `results[]`, e a alíquota viaja em percentual.** Duas coisas medidas em
produção em 18–19/08/2026, contra a nota `5253521`, que ficou presa em "Aguardando autorização":

- `GET /notas/?id_nota=` responde `{success:true, results:[nota]}`, e a nota traz `Status` (medido:
  `"Falha"`), `Nfse`, `DataEmissao` e uma lista `Erro[]` de `{Codigo, Correcao, Mensagem}`. O
  vocabulário anterior (`data`, `situacao`, `codigo_erro`) era **inferido e nunca existiu**: toda
  consulta caía em `malformed_response`, e **nenhuma NFS-e liquidava** — nem autorizada nem
  rejeitada, só adiada de meia em meia hora para sempre. Quem decide agora é o fato antes do rótulo:
  `Erro[]` preenchida é recusa mesmo com `Status` desconhecido, e autorização sem número, data e
  código de verificação continua sendo `malformed_response`. As chaves são lidas em caixa baixa
  (`normalizeKeys`) porque o corpo mistura `id_nota` com `Status` e `Nfse`. A recusa carrega **todos**
  os motivos, não só o primeiro — a 5253521 voltou com `E215` e `E227` juntos, e guardar um por vez
  custaria uma rodada de emissão fiscal por erro escondido; com mais de um, cada motivo leva o
  código dele na mensagem. **A autorização foi medida em 19/08/2026** (nota `5254907`, NFS-e nº 65):
  ela chega como `Status: "Sucesso"` — não "Autorizada" — e **sem `CodigoVerificacao`**; o código de
  verificação sai como último segmento de `Link`
  (`https://notarp.com.br/nota/{id}/{numero}/{codigo}`), a URL pública que a prefeitura publica.
  Sem os dois ajustes a nota autorizada caía em `malformed_response` de meia em meia hora, com a
  emissão já paga do outro lado. Autorização sem número, data **ou** código de verificação (nem no
  campo, nem no `Link`) continua sendo `malformed_response`: não há o que arquivar.
- `Aliquota` é **percentual** no fio (`2`), fração no domínio (`0.020000`, que é o que multiplica o
  valor do serviço). Mandar a fração fez a prefeitura recusar com `E227 — Alíquota Serviços fora do
intervalo de 2% e 5%`. A conversão é `toIssRatePercentage` no `nfse-fiscal-gateway.ts`, textual e
  não aritmética: `Number` traria erro binário para dentro de campo fiscal.

⚠️ `ItemListaServico` e `CodigoTributacaoMunicipio` são **cadastro**, não código: o par
`160201`/`160101` da mesma nota foi recusado com `E215 — Item da lista de serviço incompatível com o
código de tributação`. Quem corrige é o perfil de emissão, na aba **Configurações** de
`nfse-invoice`. **Quem diz o par válido é o próprio provedor**, não a tabela da LC 116:
`GET /dados-cadastrais` (com os dois cabeçalhos) devolve `cadastro.atividades`, a lista de
atividades que a prefeitura registrou para aquele prestador — medido em 19/08/2026 nesta conta:
`160101` "16.01.01 - Transporte de Natureza Municipal" e `160107` "16.02 - Transporte de Cargas".
`CodigoTributacaoMunicipio` é o **código** da atividade (`160107`) e `ItemListaServico` é o item da
LC 116 que a descrição dela anuncia, sem formatação (`1602`). Um `ItemListaServico` de seis dígitos
é sinal de que o código municipal foi digitado no campo errado.

**A prefeitura não emite sem o endereço do tomador.** O RPS leva `Cep · Endereco · Numero · Bairro ·
Cidade · Estado` (`Complemento` e `Telefone` só quando não vazios; `Cidade` é **nome** e `Estado` é
**sigla**, não códigos IBGE), montados por `buildTakerAddressFields` no `nfse-fiscal-gateway.ts` do
worker. Quem decide o que é endereço completo é
`api-transportada/src/nfse-invoices/domain/nfse-taker-address.policy.ts` — cidade, bairro, número, CEP
de oito dígitos, UF de duas letras e logradouro obrigatórios, e ela canonicaliza CEP e UF no caminho.
Falta de endereço é bloqueio de **prévia** (`NFSE_DOCUMENT_MISSING_TAKER_ADDRESS`), pelo participante
que o `taker` do perfil escolhe — não recusa da prefeitura com as NF-e já travadas. O endereço entra no
payload congelado e no `payloadSha256`; `taker.address` é opcional no `payloadSchema` do worker de
propósito, porque payload congelado antes da spec 043 precisa continuar sendo transmitido e recusado
pela prefeitura — a causa real — em vez de morrer como `invalid_payload`, defeito nosso. Consequência:
nota rejeitada nascida antes da 043 se **descarta e emite de novo**; reemitir retransmite o mesmo RPS
sem endereço.

⚠️ `nfe-distribution-pull/domain/distribution-eligibility.policy.ts` é **cópia** de
`api-transportada/src/companies/domain/distribution-eligibility.policy.ts` — mesma regra, mesmo
vocabulário de razões, duas apps que não importam código uma da outra. Mudou a regra de um lado?
mude do outro; `test/companies/scheduled-distribution-parity.contract.ts` guarda a paridade do corpo
servido pelas duas rotas, e `test/nfe-distribution-pull/eligibility-reasons.contract.ts` guarda o
vocabulário no cron.

🧾 **As cinco cópias por valor da NFS-e não existem mais** (spec 052, T7). Enquanto a reconciliação
morava aqui, o cliente da Nota RP, o gateway fiscal, a política de documento, o serviço de envelope
e o schema de reconciliação eram cópia do worker, e um contrato de paridade guardava o vocabulário
nos dois. Com a rotina virando `nfse.status.pull` do worker, a cópia deixou de ter fronteira que a
justifique: **dentro de uma app se importa**, e a reconciliação usa o mesmo cliente da emissão. O
que sobrou de contrato é `worker-transportada/test/nota-rp-v2-client.contract.test.ts`, e o AAD do
envelope segue idêntico ao que selou:
`transportada:nfse-credential:v1:${companyId}:${credentialId}`.

⚠️ O catálogo `FUEL_TYPES` é **cópia por valor** nas três apps que o usam —
`api-transportada/src/shared/fuel.constant.ts`,
`frontend-transportada/src/modules/shared/fuel.constant.ts` e
`worker-transportada/src/fuel-price-pull/domain/fuel.constant.ts` — com a mesma lista, na mesma ordem
e com a mesma unidade por produto (`gnv` em `cubic-metre`, os outros quatro em `litre`). A unidade é
atributo do produto, não coluna: guardá-la por linha abriria a porta para duas linhas do mesmo
produto discordarem. Quem guarda a paridade são os contratos `test/fuel-catalog/catalog.contract.ts`
(API), `test/shared/fuel-catalog.contract.ts` (frontend) e
`test/fuel-price-pull/catalog.contract.ts` (worker) — mudou produto ou unidade de um lado? mude dos
três. Uma linha de GNV lida como litro entra no banco sem reclamar de nada.
