# Feature 281 — Importar o zip semanal de XMLs da Spani

## Problema e resultado

Toda semana a Spani manda por email (exemplo: "Frete Fernandes - Semana 19/10/2026 a
23/10/2026") uma planilha de frete (`AFR Fernandes - 19 a 23-10-2026.xlsx`) e os XMLs das NF-e do
período, hoje em um `.zip` (`ID9910_procNFe_parte1.zip`). A distribuição DF-e da SEFAZ (feature 005/011)
não entrega todas: na faixa 914060–918210 faltam notas em produção.

Resultado desta feature, **primeira etapa do fluxo semanal**: o operador sobe o zip e o sistema importa
os XMLs por cima do que já veio da SEFAZ, **descartando o que já existe** e mostrando um resumo
(importadas, já existiam, inválidas). Nada de CT-e, fatura, NFS-e ou email nesta feature.

## Dados do primeiro lote (conferidos nos arquivos reais)

- Zip: 399 XMLs `procNFe`, notas 914060–918210, emitente Comercial Zaragoza (CNPJ 05868574001090), série 2.
- Planilha: 399 linhas (19, 21 e 23/10), colunas `DATA, DOCUMENTO1, CODCLIENTE, CLIENTE,
  CIDADECLIENTE, VALORLIQUIDO, Frete`. Bate 1 a 1 com o zip (0 de diferença nos dois sentidos).
  28 notas são de Ribeirão Preto; frete somado R$ 41.642,62.
- Cruzando com as notas já em produção nessa faixa (264, em 914060–914189, 915995–916095 e
  916097–916129): as 264 estão no zip e **135 são novas** (918074–918210). Logo o zip cobre o que a
  SEFAZ não entregou.

## Fora do escopo (etapas seguintes, outras specs)

- Escolher notas pela planilha para emitir CT-e e faturar.
- Emitir NFS-e (somente Ribeirão Preto).
- Envio por email dos XMLs em partes de 100, com fatura e tabela das notas de Ribeirão.
- Caixa de email da empresa que recebe os arquivos e responde a todos os envolvidos.
- Ler a planilha (só será lida na etapa de seleção; aqui ela serve de conferência opcional).

## Histórias priorizadas

### P1 — Importar o zip descartando duplicadas

**Given** um zip com XMLs `procNFe` de uma empresa **When** o operador com `invoices.import` o envia
**Then** cada XML novo vira NF-e importada com origem `zip`, e cada chave de acesso que já existe na
empresa é contada como "já existia" sem alterar a nota existente.

### P1 — Resumo auditável

**Then** o operador vê totais (novas, já existiam, inválidas, ignoradas) e a lista das inválidas com o
motivo; o resumo fica gravado e consultável depois.

### P2 — Reenvio do mesmo zip é seguro

**When** o mesmo zip (ou parte dele) é enviado de novo **Then** tudo sai como "já existia".

### P2 — XMLs soltos

A Spani pediu XMLs fora do zip. O envio aceita também vários `.xml` avulsos, com o mesmo resumo.

## Requisitos funcionais

- RF1 Aceitar `.zip` (somente entradas `*.xml`, ignorar pastas, `__MACOSX` e outros arquivos) e `.xml`.
- RF2 Identidade da nota = chave de acesso (44 posições) lida do XML (`infNFe/@Id`), nunca do nome do
  arquivo. Unicidade por empresa já existe (`nfe_documents_company_id_access_key_unique`).
- RF3 Aceitar apenas `nfeProc` (NF-e autorizada) cujo destinatário/emitente/transportadora seja
  coerente com a empresa do contexto; nota de outra empresa é inválida, nunca importada.
- RF4 Reaproveitar o mesmo parser e a mesma persistência da importação da SEFAZ (feature 005); o zip
  apenas muda a origem (`triggered_by`/origem `zip`).
- RF5 `companyId` vem da sessão, nunca do zip ou do payload.
- RF6 Proteção contra zip malicioso: limite de tamanho do arquivo, de entradas e de bytes
  descompactados, sem seguir caminhos (`..`), sem descompactar em disco.
- RF7 Idempotente e atômica por XML: falha em um não desfaz os demais; o resumo diz quais falharam.

## Requisitos não funcionais

- Zip de ~400 XMLs (poucos MB) conclui em segundos; lotes maiores processam em background pelo worker.
- Auditoria: quem enviou, quando, nome do arquivo, totais, `traceId`.
- XML fiscal armazenado como já é hoje (bucket por ambiente); nada de XML em log.

## Casos extremos e falhas

- Zip corrompido, vazio ou sem XMLs → erro claro, nada importado.
- XML que não é NF-e, XML de cancelamento/evento, NF-e sem protocolo → inválido com motivo.
- Mesma chave duas vezes no mesmo zip → conta uma vez, a outra como "já existia".
- Nota já cancelada ou denegada no sistema → mantém o estado, conta como "já existia".

## Critérios de aceite

- O zip de 19–23/10 importa 135 notas novas e reporta 264 como já existentes (em produção hoje).
- Segundo envio do mesmo zip: 0 novas, 399 já existiam.
- Contratos negativos: outra empresa, sem permissão, zip bomba, caminho com `..`.

## Dúvidas

- A Spani manda mais de uma parte por semana (o arquivo se chama `parte1`)?
- A planilha deve bloquear/avisar quando houver XML no zip que não esteja nela (e vice-versa) já nesta
  etapa, ou só na etapa de seleção?
- O que fazer com nota do zip que a SEFAZ entregar depois (a SEFAZ passa a ser a fonte e o zip só
  complementa)? Proposta: a importação por chave é idempotente, então nada muda.
