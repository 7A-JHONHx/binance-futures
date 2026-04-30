# Binance Futures Trading Bot

Bot de trading para Binance Futures com foco em:

- analise tecnica modular
- execucao `live` e `paper`
- backtest com candles historicos
- persistencia local de estado, trades e metricas
- API e painel web para monitoramento
- Postgres opcional para historico e consulta estruturada
- controle diario de meta de lucro e limite de entradas
- dashboard com graficos de equity e PnL em tempo real
- base preparada para evoluir para banco de dados e painel online

## Visao geral

O projeto usa uma estrategia analitica com:

- candles
- RSI
- MACD
- medias moveis
- volume
- order book imbalance
- ATR para volatilidade, stop e take profit

O score de entrada tambem pode ser calibrado por peso:

- tendencia
- RSI
- MACD
- candle
- volume
- order book

O robo pode operar comprado (`LONG`) e vendido (`SHORT`) de acordo com a leitura de contexto do mercado.

## Modos de execucao

### `live`

Executa ordens reais na Binance Futures.

### `paper`

Simula operacoes, saldo, taxas e resultado sem enviar ordens reais.

### `backtest`

Roda a mesma base de analise sobre candles historicos para calibracao.

## Estrutura

`src/config`
Configuracoes centralizadas.

`src/services`
Regras de negocio, estrategia, execucao, analise, monitoramento e backtest.

`src/repositories`
Camada de persistencia.
Hoje grava em arquivo, mas foi organizada para futura troca por banco.

`src/utils`
Utilitarios e indicadores tecnicos.

`src/cli`
Comandos utilitarios para rodar o bot, backtest e leitura de status.

`src/websocket`
Streaming de preco em tempo real.

`src/api`
API HTTP e painel web de monitoramento.

## Como rodar

Instale dependencias:

```powershell
npm install
```

Crie seu arquivo `.env` a partir do `.env.example` e preencha:

- `API_URL`
- `STREAM_URL`
- `API_KEY`
- `API_SECRET`
- `TELEGRAM_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_STATUS_ENABLED`
- `TELEGRAM_STATUS_INTERVAL_MS`
- `TELEGRAM_NOTIFY_STARTUP`
- `TELEGRAM_NOTIFY_DAILY_RESET`
- `LOG_FORMAT`
- `DASHBOARD_CHART_POINTS`

Rode em modo real:

```powershell
npm start
```

Rode em paper trading:

```powershell
npm run start:paper
```

Rode um backtest:

```powershell
npm run backtest
```

Consulte o snapshot de monitoramento:

```powershell
npm run status
```

Suba apenas a API/painel fora do Docker:

```powershell
npm run api
```

## Como rodar com Docker

O projeto agora tambem pode rodar em container, o que ajuda em:

- ambiente padronizado entre maquina local e servidor
- deploy mais simples em VPS
- reinicio automatico do bot
- persistencia do estado local via volumes
- painel web e API no mesmo stack
- Postgres pronto para historico estruturado

Arquivos principais:

- [Dockerfile](./Dockerfile)
- [docker-compose.yml](./docker-compose.yml)
- [`.dockerignore`](./.dockerignore)

### Preparar o ambiente

Crie e preencha seu `.env` normalmente a partir do `.env.example`.
As credenciais continuam fora da imagem Docker.

### Subir o bot em modo real

```powershell
docker compose up -d bot
```

Ou:

```powershell
npm run docker:up
```

### Ver logs do bot

```powershell
docker compose logs -f bot
```

Ou:

```powershell
npm run docker:logs
```

### Rodar em paper trading com Docker

```powershell
docker compose --profile paper up -d bot-paper
```

Ou:

```powershell
npm run docker:up:paper
```

### Subir a plataforma completa

Esse comando sobe:

- `postgres`
- `control-center` com API e painel
- `bot`

```powershell
npm run docker:up:platform
```

Depois disso, o painel fica disponivel em:

- [http://localhost:3000](http://localhost:3000)

### Consultar snapshot/metrics pelo container

```powershell
docker compose --profile tools run --rm status
```

Ou:

```powershell
npm run docker:status
```

### Rodar backtest via Docker

Backtest padrao:

```powershell
docker compose --profile tools run --rm backtest
```

Com parametros:

```powershell
docker compose --profile tools run --rm backtest --symbol BTCUSDT --interval 5m --limit 1000
```

Ou:

```powershell
npm run docker:backtest
```

### Parar os containers

```powershell
docker compose down
```

Ou:

```powershell
npm run docker:down
```

### Persistencia local no Docker

O Compose monta volumes locais para:

- `.runtime/`
- `data/`

Isso significa que:

- o bot nao perde o estado local ao recriar o container
- historico, metricas e snapshots continuam disponiveis fora do container
- o projeto ja fica pronto para depois ganhar API, banco e painel

### API do painel

Quando o `control-center` estiver de pe, os endpoints principais ficam em:

- `/api/health`
- `/api/overview`
- `/api/status`
- `/api/metrics`
- `/api/trades`
- `/api/analyses`

O painel usa essas rotas para montar o dashboard e pode cair para leitura em arquivo se o Postgres ainda estiver vazio.
Agora ele tambem exibe:

- curva de equity em tempo real
- PnL acumulado e PnL em aberto
- acompanhamento visual das ultimas operacoes

## Controle diario

Voce pode bloquear novas entradas quando atingir uma meta de lucro no dia
ou um limite de entradas no dia. O reset acontece automaticamente pela data
do fuso configurado.

Variaveis principais:

- `DAILY_PROFIT_TARGET_USDT`
  - `0` desativa a meta diaria de lucro
- `DAILY_PROFIT_TARGET_MODE`
  - `positive` usa apenas a soma dos fechamentos positivos do dia
  - `net` usa o resultado liquido do dia
- `DAILY_MAX_ENTRIES`
  - `0` desativa o limite diario de entradas
- `DAILY_RESET_TIME_ZONE`
  - define o fuso da virada diaria, por exemplo `America/Sao_Paulo`
- `TAKE_PROFIT_MODE`
  - `trail_after_target` deixa a operacao aberta apos atingir o alvo e entrega a saida para o trailing stop
  - `fixed` encerra a operacao assim que o take profit for atingido
- `EXCHANGE_PROTECTION_ENABLED`
  - ativa o uso de ordens nativas na Binance
- `POSITION_SYNC_INTERVAL_MS`
  - define o intervalo de sincronizacao com a corretora quando houver posicao aberta
- `PROTECTION_WORKING_TYPE`
  - usa `CONTRACT_PRICE` ou `MARK_PRICE` para disparo das ordens nativas
- `PROTECTION_PRICE_PROTECT`
  - habilita ou desabilita o `priceProtect` das ordens nativas
- `MIN_ATR_PERCENT`
  - afrouxa ou aperta o filtro minimo de volatilidade
- `MACD_SCORE_WEIGHT`
  - aumenta ou reduz o peso do MACD no score final
- `DASHBOARD_CHART_POINTS`
  - define quantos pontos o painel usa para montar os graficos

### Ordens nativas na Binance

O projeto agora consegue criar e acompanhar ordens nativas de:

- `STOP_MARKET`
- `TAKE_PROFIT_MARKET`

Importante:

- se `TAKE_PROFIT_MODE=trail_after_target`, a Binance recebe apenas a `STOP_MARKET`
- isso acontece porque uma `TAKE_PROFIT_MARKET` nativa fecharia a posicao assim que o alvo fosse tocado e impediria o trailing de continuar
- se voce quiser ver `STOP_MARKET` e `TAKE_PROFIT_MARKET` ao mesmo tempo na Binance, use `TAKE_PROFIT_MODE=fixed`

## Telegram

As mensagens do Telegram agora tambem podem servir como painel resumido do robo.
O bot pode avisar:

- inicio do bot
- virada do dia operacional
- nova operacao aberta
- alvo atingido com trailing ativado
- encerramento da operacao com resultado
- resumos periodicos do status, metas do dia e protecoes nativas

## Arquivos uteis

[COMANDOS.md](./COMANDOS.md)
Lista comentada dos comandos principais.

[ARQUITETURA.md](./ARQUITETURA.md)
Explica como o projeto foi organizado para crescer.

## Seguranca

- Nao publique seu `.env`
- Use apenas `.env.example` no repositório
- O Docker nao embute suas credenciais na imagem; elas entram por `env_file`
- Se alguma chave tiver sido exposta anteriormente, gere novas credenciais antes de operar

## Saidas geradas pelo projeto

O bot salva artefatos locais em:

- `data/history`
- `data/monitoring`
- `data/backtests`
- `.runtime`

Esses arquivos servem como base para auditoria, calibracao e futuro painel de monitoramento.
