# Fase 7 - Fundacao do Trading Engine no Bot Worker

Nesta fase, a nova arquitetura ganhou a primeira camada real de engine dentro do `apps/bot-worker`.

## Objetivo

- parar de deixar o `bot-worker` apenas como bootstrap e sincronizacao
- criar uma camada propria para hospedar estado e estrategia do legado
- preparar a migracao futura da logica do robo para TypeScript nativo

## O que entrou

- `TradingEngineService` como orquestrador principal do worker
- `LegacyStateBridge` para ler e normalizar o estado legado
- `LegacyStrategyBridge` para encapsular o bootstrap e a estrategia atual
- `trading-engine.types.ts` com contratos tipados da camada operacional
- exportacoes mais explicitas em `src/index.js`:
  - `bootstrapLegacyStrategy()`
  - `startLegacyMarketStream()`
  - `startLegacyBotRuntime()`

## Ganho desta fase

O `bot-worker` agora ja consegue:

1. subir a nova base
2. carregar o estado legado de forma tipada
3. inicializar o engine operacional por uma camada propria
4. manter o caminho aberto para substituir o legado modulo por modulo

## Observacao

Nesta fase, a estrategia ainda nao foi reescrita em TypeScript. O foco foi criar a fundacao correta para a migracao da inteligencia operacional sem quebrar o robo atual.
