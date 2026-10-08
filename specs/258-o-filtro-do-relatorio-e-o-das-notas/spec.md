# Feature 258 — O filtro do relatório de viagens é o filtro das notas

## Problema e resultado

O relatório de viagens (`/trips`, spec 253) filtra por 8 coisas; a aba de notas filtra por 14 mais o modo
avançado (E/OU). Quem sabe achar "as notas 00001 a 99999 da AMARELINHA emitidas em outubro" na aba de notas não
consegue pedir o mesmo no relatório. O resultado: **um só painel de filtro**, o das notas, usado nas duas telas, e o
servidor do relatório aceitando tudo o que o painel oferece.

## Decisões do usuário (2026-10-08)

- **Todos** os filtros das notas existem no relatório, incluindo faixa de número (`00001` a `99999`).
- O filtro vira **componente compartilhado** — já é usado em vários lugares.
- Cobertura **simples + avançado** (AND/OR).
- **Não quebrar o que existe**: os filtros de hoje apenas **se movem**; o da aba de notas é a referência correta.
- A situação das entregas (`documentStatusIn`) continua filtrando **só dentro** das notas escolhidas pelo resto.

## Decisões por delegação

- **Duas entregas.** Entrega 1 (simples) vale sozinha e destrava a 256; entrega 2 (avançado) exige revisão de
  segurança antes do push. Entrega 1 não depende da 2.
- **O avanço é no servidor.** A aba de notas filtra no cliente sobre a lista carregada; o relatório pode ter
  milhares de notas, então a tradução é em SQL (Drizzle), com listas fechadas de coluna e operador.
- **Dois "status" diferentes, dois nomes.** `status` do painel = situação **fiscal** da nota (autorizada/cancelada/
  denegada). `documentStatusIn` = situação **da entrega** na viagem. Rótulos e chaves não se misturam.
- **"Sem vínculo" não vai ao relatório.** O relatório só tem notas em viagem; o controle fica oculto ali.

## Requisitos

- **RF1** `NfeDocumentFilterPanel` passa a morar em `modules/shared` sobre uma **interface de controlador**
  (valores, setters, opções), e a aba de notas, a criação de viagem e o relatório o usam. Comportamento e testes da
  aba de notas **inalterados**.
- **RF2** O relatório aceita: faixa de número (comparação **numérica**), data de emissão, valor (operador+valor),
  emitente (nome, CNPJ, endereço, cidade, UF), destinatário (nome, endereço, cidade, UF), CT-e emitido, situação
  fiscal. Texto = contém, sem diferenciar caixa; múltiplos = qualquer um.
- **RF3** Mudar filtro continua refletindo na URL, nas pílulas e no que `Exportar relatório`/`canhotos` enviam.
- **RF4** Entrega 2: o servidor aceita a árvore de condições (grupos, `and`/`or`, 14 campos, operadores por tipo)
  validada por Zod com limite de profundidade e de condições; tradução só por mapa fechado; **nunca** `sql.raw` com
  valor do cliente.
- **RF5** Os filtros que o relatório já tem (busca, contratante, cidade/UF do destinatário, valor, situação da
  entrega) seguem funcionando com o mesmo contrato de URL.

## Fora do escopo

Mudar a aba de notas para filtrar no servidor; salvar filtro avançado do relatório; filtros por campo de viagem
novos.
