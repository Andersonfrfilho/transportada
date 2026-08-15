# Integração Nota RP (NFS-e) — v2

Documentação interna do provedor de NFS-e. O material original do fornecedor está versionado em
`docs/integrations/nota-rp/vendor-v2/` (leia-me, changelog e coleção Postman), porque ele não está
publicado na web: chega por download no painel, e a cada versão nova o link anterior morre. Sem cópia
no repositório, a regra de integração vira memória de quem estava na sala.

Este arquivo é o resumo operacional; **em divergência, o material do fornecedor manda**.

## Um endereço só

`https://www.notarp.com.br/api/v2` — é o valor de `baseUrl` na coleção, e é o único servidor que o
provedor publica. **Não existe homologação.** Quem separa uma instalação da outra é a credencial
selada por empresa, não a URL. É a decisão do ADR-0035, e é por isso que `NFSE_PROVIDER_BASE_URL`
substituiu o par `_HOMOLOGATION`/`_PRODUCTION`.

## Autenticação — dois cabeçalhos, não `Authorization`

```
X-AUTH-USER-TOKEN: <token da conta>
X-AUTH-IM:         <inscrição municipal da empresa>
```

O token identifica **a conta**; a inscrição municipal identifica **a empresa** dentro dela. Uma conta
associa várias empresas, então o token sozinho não diz em nome de quem se emite — os dois são
obrigatórios, e o erro de qualquer um deles reprova a requisição.

O token é gerado e revogado em `https://www.notarp.com.br/painel/integracao`.

> ⚠️ **Defeito conhecido:** `nota-rp-v2.client.ts` (worker) e a cópia no cron mandam
> `authorization: Bearer <token>`, cabeçalho que o provedor ignora. Nenhuma chamada nossa está
> autenticada hoje. Ver "Como isso passou despercebido", abaixo.

## Status HTTP não é o resultado

- Sucesso: `success: true`, HTTP 200.
- **Erro de negócio: `success: false` + `message`, também HTTP 200.**
- Só um status diferente de 200 é falha de comunicação entre servidores.

Quem decide é o corpo. O cliente já trata assim (`readEnvelope`), e o comentário no topo do arquivo
registra a razão — esta é a parte da integração que estava certa.

## Emissão é assíncrona, e o `CallbackUrl` é obrigatório

`POST /emitir` devolve `id_nota` na hora, e o resultado chega depois por postback. O campo
`CallbackUrl` é **obrigatório** e precisa ser `https`.

A URL recebe no máximo duas mensagens por nota, de dois tipos: `protocolo-nota` e `situacao-lote`.
Quando vem `Situação = 4`, os dados da nota emitida já viajam em `ListaNfse->CompNfse[0]` — não é
preciso consultar de novo.

Política de reenvio quando a nossa ponta não responde 200:

| Janela | Tentativas |
|---|---|
| a cada 30 segundos | 20 |
| a cada 5 minutos | 22 |
| a cada hora | 10 |

Esgotado o limite, a saída é consultar `GET /notas/?id_nota=xxx`. **URL de retorno inválida ou
indisponível sujeita a integração a suspensão por mau uso** — não apontar para `webhook.site` a
partir de conta de produção.

> ⚠️ **Defeito conhecido:** não mandamos `CallbackUrl` em lugar nenhum — `webhook` não aparece no
> trilho de NFS-e de nenhuma das três apps. E `NFSE_CALLBACK_BASE_URL` não está definida na `api` de
> produção, então a rota `POST /public/nfse-callbacks/:token` sequer é registrada.

O postback pode ser assinado: preenchendo o campo de segredo no painel, todo POST vai com
`X-Signature`, o HMAC-SHA256 do corpo. **A nossa rota não lê esse cabeçalho** — ela autentica por
token opaco no caminho. São dois desenhos de prova de origem; ligar o postback exige escolher um.

## Rotas

| Método | Rota | Uso |
|---|---|---|
| POST | `/emitir` | emitir, corrigir nota falhada (com `id_nota`) e substituir (com `SubstituirNfse`) |
| POST | `/cancelar-nota` | cancelar; `motivo` obrigatório |
| GET | `/notas/?id_nota=` | consultar uma nota |
| GET | `/notas/?q=` | buscar por nome |
| GET | `/notas/{emitidas\|canceladas\|pendentes}/:mes/:ano` | listagens paginadas (`start`, `length`) |
| GET | `/xml/:id_nota` | XML da nota, em base64 |
| GET | `/pdf/:id_nota` | PDF no layout da Nota RP, em base64 |
| GET | `/dados-cadastrais` | dados da empresa; traz `operacoes_permitidas` |
| GET | `/atualizar-dados-cadastrais` | força releitura junto à prefeitura |
| GET | `/cnaes/?q=&page=` | catálogo |
| GET | `/item-servico/?cnae=&page=` | catálogo; descrição já formatada `00.00` |
| GET | `/tributacao-municipio/?q=&page=` | catálogo |
| GET | `/cidades-ibge/?q=&page=` · `/paises-ibge/?q=&page=` | catálogos |

`motivo` do cancelamento aceita **1** (erro na emissão — a resposta manda usar substituição), **2**
(serviço não prestado) e **4** (nota duplicada).

`GET /notas/` **responde 200 com lista vazia mesmo sem autenticação**. Não serve para verificar
token; use `/dados-cadastrais`, que devolve 401 `{"success":false,"message":"Token inválido."}`.

## Campos de emissão que mudaram na v2

- `NaturezaOperacao` foi desativado.
- `MunicipioPrestacaoServico` virou `CodigoMunicipio`.
- Novos: `ExigibilidadeISS` (valores válidos vêm de `operacoes_permitidas`, em `/dados-cadastrais`),
  `MunicipioIncidencia`, `NumeroProcesso` (só quando exigibilidade é 6 ou 7), `CodigoNbs`,
  `SubstituirNfse`, e o bloco de exterior (`NIF`, `Pais`, `EnderecoCompletoExterior`).
- Substituição é **síncrona**, ao contrário da emissão: devolve `id_nota` e `id_nota_substituida` na
  própria resposta.

## Como isso passou despercebido

O `GET /notas/` responde 200 com envelope vazio para token válido, token inventado e requisição sem
cabeçalho nenhum. Uma verificação feita por essa rota confirma qualquer coisa que se queira
confirmar. Foi assim que o cabeçalho errado sobreviveu: o trilho não tinha nota para reconciliar,
a consulta respondia 200, e nada apontava para a autenticação.

A lição vale para além daqui: **teste de integração com terceiro só vale com o controle negativo
junto** — a mesma chamada com credencial inválida precisa falhar de forma visivelmente diferente.
