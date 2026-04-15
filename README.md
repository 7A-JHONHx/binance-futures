# Binance Futures Trading Bot

Bot de trading para Binance Futures com foco em:

- analise tecnica modular
- execucao `live` e `paper`
- backtest com candles historicos
- persistencia local de estado, trades e metricas
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

## Arquivos uteis

[COMANDOS.md](./COMANDOS.md)
Lista comentada dos comandos principais.

[ARQUITETURA.md](./ARQUITETURA.md)
Explica como o projeto foi organizado para crescer.

## Seguranca

- Nao publique seu `.env`
- Use apenas `.env.example` no repositório
- Se alguma chave tiver sido exposta anteriormente, gere novas credenciais antes de operar

## Saidas geradas pelo projeto

O bot salva artefatos locais em:

- `data/history`
- `data/monitoring`
- `data/backtests`
- `.runtime`

Esses arquivos servem como base para auditoria, calibracao e futuro painel de monitoramento.
