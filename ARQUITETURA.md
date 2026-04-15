# Arquitetura do robo

## Visao geral

O projeto foi separado para facilitar evolucao para:

- banco de dados
- API para painel web
- deploy em servidor online
- novos modos de execucao
- novos adaptadores de notificacao

## Estrutura principal

`src/config/`
Guarda configuracoes centralizadas do robo.

`src/services/`
Contem regras de negocio e orquestracao.

`src/repositories/`
Contem adaptadores de persistencia.
Hoje grava em arquivo.
No futuro pode ser trocado por Postgres, MySQL, MongoDB ou Redis sem mudar a estrategia.

`src/utils/`
Funcoes puras e utilitarios, como indicadores tecnicos.

`src/cli/`
Entrypoints para comandos de terminal como paper trading, backtest e leitura de status.

`src/websocket/`
Entrada de dados em tempo real via stream da Binance.

## Pontos preparados para expansao

### 1. Banco de dados

Hoje a escrita de historico e monitoramento passa por:

- `src/repositories/file-storage.repository.js`
- `src/services/journal.service.js`

Quando for migrar para banco, o caminho natural e:

1. criar um repositorio novo, por exemplo `database-storage.repository.js`
2. manter a mesma interface de escrita
3. trocar a implementacao usada pelos services

### 2. Painel web / API

Hoje o robo ja gera arquivos prontos para consumo externo:

- `data/monitoring/bot-status.json`
- `data/monitoring/metrics.json`

Um servidor Express, Fastify ou Next.js pode simplesmente ler esses dados no começo.
Depois, se quiser crescer, a mesma camada pode passar a ler do banco.

### 3. Modo real vs paper

A diferenca entre execucao real e simulada foi isolada em:

- `src/services/execution.service.js`

Isso evita misturar regra de estrategia com envio de ordem.

### 4. Estrategia e analise

A analise tecnica ficou separada em:

- `src/services/analysis.service.js`
- `src/utils/indicators.js`

Isso facilita:

- trocar criterios de entrada
- adicionar novos indicadores
- reaproveitar a mesma analise no backtest

### 5. Estado e recuperacao

O estado operacional do robo fica em:

- `src/services/state.service.js`

Isso permite:

- recuperar posicao apos reinicio
- manter cooldown
- guardar ultima analise
- sustentar modo paper

## Evolucao sugerida para servidor online

Uma evolucao natural seria:

1. criar uma API REST para expor `status`, `metrics`, `trades` e `analyses`
2. colocar autenticacao
3. trocar repositorio de arquivo por banco
4. criar painel web com graficos e status em tempo real
5. adicionar fila/eventos para notificacoes e auditoria
