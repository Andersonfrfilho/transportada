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

## O fluxo completo, com confirmação a cada passo (decidido com Anderson em 27/10/2026)

Quando o email da semana chega, nada acontece sozinho: o sistema prepara cada passo e **pede
confirmação numa tela** antes de agir. Os passos, em ordem:

1. **Chegou o email** da Spani (zip + planilha): o sistema importa os XMLs sem duplicar (etapa 1) e lê
   a planilha. Tela: resumo da importação e das notas da planilha.
2. **Emitir CT-e e NFS-e das notas selecionadas** (só as que constam na planilha; NFS-e só de Ribeirão
   Preto). Tela de confirmação com a lista, antes de emitir.
3. **Fatura dos CT-e** emitidos. Tela de confirmação.
4. **Enviar por email, respondendo a todos os envolvidos** do email original: os XMLs em partes de 100
   (informando as partes), a fatura, a NFS-e (PDF) e a tabela das entregas municipais (Ribeirão) no corpo.
   Tela de confirmação com destinatários, partes e anexos.

Regras:

- Isso vale **somente para o fluxo de pagamento da Spani**: faturamento configurado sempre para
  **15 dias**. Outros contratantes não entram.
- Haverá uma **página para criar essas automações** (contratante, gatilho "chegou email", passos,
  prazo de faturamento, quem recebe), em vez de regra fixa no código. Nada de CNPJ ou nome da Spani
  escrito no código.
- Cada confirmação fica registrada (quem confirmou, quando, o que foi feito) na auditoria.

## Etapas de entrega (specs próprias, cada uma com modelo indicado no tasks.md)

- 2. Ler a planilha e selecionar as notas; emitir CT-e e NFS-e com confirmação.
- 3. Fatura dos CT-e com confirmação.
- 4. Envio por email em partes de 100, respondendo a todos, com fatura, NFS-e (PDF) e tabela de Ribeirão.
- 5. Caixa de email da empresa que recebe os arquivos e dispara o fluxo (exemplo de destinatários:
     Michele, Gleidson, Deisy, procopioau e a caixa `ctezaragoza_ent`).
- 6. Página para criar e editar as automações (contratante, prazo de 15 dias, passos).

## Dúvidas

- A Spani manda mais de uma parte por semana (o arquivo se chama `parte1`)?
- A planilha deve avisar quando houver nota no zip fora dela (e vice-versa)? Proposta: na etapa 2.
