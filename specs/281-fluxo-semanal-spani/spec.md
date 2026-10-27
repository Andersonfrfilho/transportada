# Feature 281 — Fluxo semanal da Spani

## Problema e resultado

Toda semana a Spani manda por email ("Frete Fernandes - Semana 19/10/2026 a 23/10/2026") uma planilha
de frete (`AFR Fernandes - 19 a 23-10-2026.xlsx`) e os XMLs das NF-e do período em um `.zip`
(`ID9910_procNFe_parte1.zip`). Hoje o operador cruza tudo à mão. Esta feature organiza o fluxo em
etapas, cada uma entregue e verificada separadamente.

## Etapa 1 — Importar os XMLs do zip sem duplicar (JÁ EXISTE)

A importação do zip já está no sistema; esta spec só registra e verifica:

- O painel de NF-e aceita `.xml` e `.zip` (`NfeUploadPanel`), enviando em lotes de até 768 KB.
- O worker expande o zip (`nfe-import-archive-expander.gateway.ts`: máx. 500 entradas, 5 MB por
  entrada, 100 MB no total, razão de compressão 20, bloqueia `..`) e identifica cada nota pela chave de
  acesso. Nota que já existe vira `duplicated` e é contada no resumo (`duplicatedCount`).

Dados do lote real de 19–23/10 (conferidos nos arquivos):

- Zip com 399 XMLs, notas 914060–918210, emitente Comercial Zaragoza (CNPJ 05868574001090).
- Planilha com 399 linhas (colunas `DATA, DOCUMENTO1, CODCLIENTE, CLIENTE, CIDADECLIENTE,
VALORLIQUIDO, Frete`), 1 a 1 com o zip; 28 notas de Ribeirão Preto; frete somado R$ 41.642,62.
- Contra as 264 notas já em produção nessa faixa: 264 repetidas e **135 novas** (918074–918210).

Critério de aceite da etapa 1: subir o zip do lote gera 135 importadas e 264 duplicadas; subir de novo
gera 0 importadas e 399 duplicadas. A verificação (e o runbook) entram como evidência desta spec. Se
algum limite do expander recusar um zip real da Spani, ajustamos o limite, sem código novo de importação.

## Etapas seguintes (specs próprias, cada uma com modelo indicado no tasks.md)

- 2. Selecionar pela planilha as notas para emitir CT-e e faturar (só o que consta na planilha).
- 3. Emitir NFS-e apenas das notas de Ribeirão Preto.
- 4. Enviar por email os XMLs em partes de 100, informando as partes, com a fatura e, no corpo, a tabela
     das notas de Ribeirão. A Spani pede os XMLs fora do zip, mais o Excel, o PDF da fatura e a nota de
     serviço de Ribeirão.
- 5. Caixa de email da empresa que recebe os arquivos e responde a todos os envolvidos (no exemplo:
     Michele, Gleidson, Deisy, procopioau e a caixa `ctezaragoza_ent`).

## Dúvidas

- A Spani manda mais de uma parte por semana (o arquivo se chama `parte1`)?
- A planilha deve avisar quando houver nota no zip fora dela (e vice-versa)? Proposta: na etapa 2.
