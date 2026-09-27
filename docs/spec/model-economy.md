# Economia de modelo — qual modelo roda qual task

> Escrito em 2026-09-26, **depois** de seis documentos o citarem como se existisse
> (`specs/005`, `specs/066`, `specs/086`, `specs/OBJETIVO-MAPA.md`,
> `specs/OBJETIVO-PENDENTES.md`, e a `specs/211`). A citação era quebrada; o que ela apontava era
> convenção viva e não escrita. Este arquivo **descreve a prática medida**, não inventa regra nova.
>
> Complementa `agent-strategy.md`, que tem a tabela de agentes e o roteamento econômico. Aquele é
> sobre **quem** delega; este é sobre **o que cada task exige**.

## Quanto disso já é prática (medido em 2026-09-26)

| Sinal                               | Quantos       |
| ----------------------------------- | ------------- |
| `tasks.md` no repositório           | 159           |
| com cabeçalho `🤖 Modelo:` por fase | **138** (87%) |
| com pelo menos uma task marcada 🧠  | **116** (73%) |

A convenção não é proposta: é o que a maioria das specs já faz.

## As três classes

Vem do `agent-strategy.md` § "Roteamento econômico":

| Marca | Classe   | Quando                                                                              |
| ----- | -------- | ----------------------------------------------------------------------------------- |
| ⚙️    | `haiku`  | mecânico e repetitivo: molde copiado, contagem, changeset, documentação, inventário |
| —     | `sonnet` | implementação e teste comuns — o padrão, e a maioria das tasks                      |
| 🧠    | `opus`   | gate de fiscal, concorrência, auth, criptografia, arquitetura e produção            |

## ⚠️ A marca pede a **classe**, nunca uma versão

Fixar `Opus 5.5` (ou qualquer versão) como requisito de uma task está **errado**, por três motivos,
e o repositório prova o primeiro:

- **rejeita modelo que já deu conta** — a `specs/005/tasks.md:247` registra uma task de gate de Opus
  rodada no **Opus 4.8**, com "(adequado)" escrito ao lado; a `specs/164/evidence.md:485` registra
  uma verificação que rodou no **Opus 5**;
- **trava a sessão** que tiver só a geração anterior, por uma exigência que não é real;
- **exclui a próxima geração** por leitura literal — um Opus 6 não seria "Opus 5.5".

**A versão vai no registro, não no requisito.** A `evidence.md` anota o modelo **exato** que rodou
cada task; é ela que se confere depois. Rodar uma 🧠 fora da classe Opus é achado. Rodar numa
geração diferente da última, não.

## O que faz uma task ser 🧠

Levantado das 116 `tasks.md` que usam a marca. Uma task é 🧠 quando erra caro e o erro não aparece
no teste:

- **migration e schema** — `CHECK`, coluna nova em tabela com dado, e qualquer `drop`;
- **concorrência** — `FOR UPDATE`, transação que decide dinheiro, idempotência de trilho de entrada;
- **auth e criptografia** — token derivado, assinatura de webhook, DKIM, envelope de segredo;
- **recorte de tenant** — contrato que prova que uma empresa não lê a outra;
- **fronteira de módulo e composition root** — desenho que vira contrato de quem importa;
- **máquina de estado e policy de domínio** — o núcleo que o resto assume correto;
- **medição que decide desenho** — spike cujo resultado escolhe a arquitetura;
- **superfície externa** — o que outra app ou outro produto passa a depender;
- **revisão final** de código, segurança e design.

O contrário também vale: implementar rota que segue molde existente, escrever teste previsível e
mexer em texto **não** são 🧠, por mais central que seja o assunto.

## Os dois modos de usar Opus

A prática tem dois, e eles não são intercambiáveis:

### Modo A — escalar para validar (15 ocorrências)

O `sonnet` implementa e o `opus` confere antes de fechar:

```
> 🤖 Modelo: `sonnet` (T004, T008 e T010 são 🧠 — validar com `architect` em `opus` antes de
> escrever)
```

Serve quando a implementação é comum e o **risco está na decisão** que ela encerra. Mais barato, e
o padrão para a maioria das 🧠.

### Modo B — parar e trocar

A sessão inteira troca de modelo antes de começar:

```
> 🤖 `opus` — **PARAR e trocar de modelo antes de começar**
```

Serve quando o **raciocínio inteiro** é a entrega: arquitetura, criptografia, migração destrutiva.
Escrever no `sonnet` e revisar depois não recupera o que não foi pensado.

⚠️ **Parar é parar.** A sessão não segue sozinha numa task de modo B porque "já está quase" — a
troca de modelo é o ponto da marca.

## Onde a marca mora

Por **fase**, no cabeçalho, quando a fase inteira é homogênea:

```
> 🤖 Modelo: `sonnet` · T301 é 🧠 (migration) — revisar com `architect` em `opus`
```

Por **task**, quando a fase mistura (é o mais informativo, e o que a `specs/211` adotou nas 53
tasks dela):

```
- [ ] **T301** 🧠 `opus` — Teste do token derivado, fixando byte a byte o token de hoje.
- [ ] **T311** ⚙️ `haiku` — `changeset` das fases 1–3.
```

As duas formas valem. A segunda evita a pergunta "esta task aqui é qual?".

## Escalar por falha

Do `agent-strategy.md`: **depois de duas falhas equivalentes, escale o modelo ou divida a task.**
Insistir na terceira no mesmo modelo é o padrão que queima token sem mudar resultado.

## O que este documento não decide

- **Quem** delega para subagente e com que limite de passos — é `agent-strategy.md`.
- **Se** a task existe, e em que ordem — é o `tasks.md` de cada spec.
- **Qual modelo esta sessão está rodando** — quem responde é a sessão, e a `evidence.md` registra.
