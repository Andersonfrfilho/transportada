# Objetivo — terminar as specs pendentes

> Criado em 2026-08-26. Este arquivo é o plano de execução do conjunto; cada spec continua com o
> próprio `tasks.md`. Aqui fica **a ordem e o porquê dela**.

## Regra de conclusão

Vale para toda spec deste plano, sem exceção:

- **Nada é dado por concluído sem verificação executada.** "Compila" não é "funciona".
- Teste que só existe contra fixture não prova encanamento. Onde houver integração ou smoke que
  exercite o caminho real, ele roda antes de a spec ser marcada.
- A spec só recebe `evidence.md` depois de a verificação existir — e o que ficou de fora entra
  escrito nele. **Spec marcada como concluída com buraco silencioso é pior que spec aberta**: a
  próxima pessoa confia nela.
- Modelo por fase conforme `model-economy.md`; fase 🧠 pede `opus` e a sessão para antes de começar.

## Estado inicial (verificado no código)

| Spec    | Tamanho | O que é                                 | Estado                               |
| ------- | ------- | --------------------------------------- | ------------------------------------ |
| **048** | 141     | OCR do CRLV preenche a ficha do veículo | ✅ fase CRLV; CNH/ANTT bloqueadas    |
| **057** | 272     | PWA do motorista — a viagem no bolso    | ✅ concluída                         |
| **058** | —       | roteiro se sugere sozinho               | ✅ P1; **P2 multi-veículo pendente** |
| **059** | 226     | MDF-e nasce da viagem completa          | só `spec.md`                         |
| **060** | 383     | cliente tem janela de entrega e taxa    | só `spec.md`                         |
| **061** | 216     | a viagem fecha a conta (margem real)    | só `spec.md`                         |
| **062** | 235     | WhatsApp como canal                     | só `spec.md`                         |
| **063** | 206     | portal do cliente                       | só `spec.md`                         |
| **064** | —       | portal do agregado                      | `tasks.md`, sem `evidence.md`        |

## Ordem, e a razão dela

A ordem **não** é por tamanho: é por dependência de dado. Construir consumidor antes do produtor
gera tela que mostra vazio e mediana que nunca sai do padrão — foi o que aconteceu com a D6 da 058,
que lê `arrived_at`/`completed_at` que **nada no sistema escreve** ainda.

```
048 ──┐
      ├──> 059 ──> 061
057 ──┴──────────────┘
060 ──> 063
062 (independente)
058-P2 (independente)
```

### 1. 048 — OCR preenche a ficha do veículo

Independente, e a infraestrutura **já existe**: o OCR de CNH/CRLV do agregado foi construído nesta
base (`aggregate-document-ocr`). É estender o que há para o cadastro de veículo do painel, não criar
pipeline novo. Menor risco, e entrega valor sozinha.

### 2. 057 — PWA do motorista

**É o produtor de dado que três specs esperam.** Hoje `arrived_at` e `completed_at` são colunas que
ninguém escreve; sem elas a mediana da 058 devolve `default` para sempre, e a 061 não tem custo real
de viagem. Fazer 061 antes de 057 é calcular margem sobre dado que não existe.

Depende de decisão sua: app instalável (PWA) confirmado pela spec, mas o modo offline e a captura de
comprovante têm custo próprio.

### 3. 059 — MDF-e nasce da viagem completa

A emissão já funciona; a spec fecha o laço para a viagem inteira nascer manifesto. Depende da 056
(feita) e conversa com a 057 (o que aconteceu na rua).

### 4. 060 — cliente tem hora e preço

Produz a janela de entrega que a **058 já sabe consumir** (`trip_stops.delivery_window_*` existe e o
solver a penaliza), e a taxa que a 061 precisa. Destrava a 063.

### 5. 061 — a viagem fecha a conta

Margem real por viagem. Precisa do custo que a 057 mede e da taxa que a 060 cadastra.

### 6. 063 — portal do cliente

Superfície para o cliente agendar a entrega (060 D3) e o contratante aprovar repasse (060 D5). Sem a
060 não há o que agendar.

### 7. 062 — WhatsApp

Independente das demais, mas envolve **decisão externa** — provedor, custo por conversa, número
oficial. Fica por último de propósito: é a única cujo bloqueio não é técnico.

### 8. 058 P2 — sugestão multi-veículo

Pool de notas → quais notas em qual veículo, propondo as viagens. O solver **já resolve múltiplos
veículos** e o schema já comporta (`route_suggestions.trip_id` anulável); falta a rota, o caso de uso
que carrega notas não vinculadas, o aceite que **cria** viagens, e a tela.

## O que este plano não promete

Cada spec deste conjunto tem o porte da 058, que consumiu uma sessão inteira de trabalho. O plano é
sequencial e verificável, não uma entrega única — e cada spec fechada é publicável sozinha.

Duas dependem de decisão que não é minha: a **062** (provedor de WhatsApp e custo) e a parte da
**057** que define até onde vai o offline. Elas serão sinalizadas quando chegarem, não presumidas.
