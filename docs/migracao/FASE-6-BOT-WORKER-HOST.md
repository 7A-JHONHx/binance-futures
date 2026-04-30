# Fase 6 - Bot Worker como Host Operacional

Nesta fase, o `apps/bot-worker` deixou de ser apenas uma ponte de persistencia e passou a conseguir hospedar o runtime operacional do robo legado.

## Objetivo

- preparar a troca de host do robo sem desligar o fluxo atual
- mover o bootstrap operacional para dentro da nova arquitetura
- manter a estrategia atual intacta enquanto a migracao continua

## O que entrou

- `startLegacyBotRuntime()` exportado em `src/index.js`
- `legacy-runtime-adapter.ts` no `bot-worker` para subir o runtime legado de forma controlada
- resolucao padronizada do diretorio raiz do repositorio
- normalizacao dos caminhos de `.runtime` e `data` dentro do `bot-worker`
- script raiz `npm run start:new`

## Como funciona agora

1. o `bot-worker` sobe
2. tenta iniciar a sincronizacao oficial com Postgres/Prisma
3. hospeda o runtime legado em `src/index.js`
4. mantem o robo operando e, quando houver banco, sincroniza os dados em paralelo

## Chave nova

Use `NEW_PLATFORM_OPERATION_ENABLED=false` para subir o `bot-worker` sem ligar o runtime operacional legado.

## Observacao

O `npm start` atual continua apontando para o fluxo legado da raiz. Isso foi mantido de proposito nesta fase para validar a transicao com seguranca antes de trocar o entrypoint oficial do projeto.
