# PingScope

Ferramenta para testar se um IP ou dominio responde a ping, com backend Node.js,
interface web mobile-first/PWA e base de app mobile em Expo.

App ao vivo: https://pingscope.onrender.com

![PingScope mobile preview](./pingscope-mobile-check.png)

## Funcionalidades

- Teste de IP ou dominio por ping real do sistema.
- Status online/offline.
- Latencia aproximada em ms.
- Historico dos ultimos testes.
- Modo automatico com intervalo configuravel.
- Interface web responsiva instalavel como PWA.
- App mobile Expo consumindo a mesma API.

## Estrutura

```text
pingscope/
  server.mjs
  package.json
  public/
    index.html
    styles.css
    app.js
    manifest.webmanifest
    sw.js
  mobile/
    App.js
    package.json
    app.json
```

## Rodar a versao web/PWA

```bash
npm start
```

Depois abra:

```text
http://localhost:4173
```

Para usar pelo celular na mesma rede Wi-Fi, rode o servidor e abra no celular a
URL de rede exibida no terminal, parecida com:

```text
http://192.168.0.10:4173
```

## API

```http
POST /api/ping
content-type: application/json

{
  "target": "8.8.8.8",
  "timeoutMs": 2500,
  "count": 1
}
```

## App mobile Expo

O codigo do app mobile esta em `mobile/`.

```bash
cd mobile
npm install
npm start
```

No celular, coloque no campo `Servidor` a URL de rede do backend, por exemplo
`http://192.168.0.10:4173`.

## Observacao tecnica

Navegadores e apps mobile comuns nao fazem ICMP ping direto de forma confiavel.
Por isso o backend faz o ping e o app so consome a API.

## Deploy gratis no Render

Este projeto precisa de um Web Service porque o backend executa o comando
`ping`. GitHub Pages e Netlify sao ideais para sites estaticos, mas nao rodam
esse backend.

Passo a passo:

1. Entre em https://render.com e faca login com GitHub.
2. Clique em `New +` e escolha `Web Service`.
3. Selecione o repositorio `setedmsk/pingscope`.
4. Em `Language`, escolha `Docker`.
5. Em `Branch`, escolha `main`.
6. Em `Instance Type`, escolha `Free`.
7. Clique em `Deploy Web Service`.

O `Dockerfile` instala o pacote `iputils-ping`, copia a interface web e inicia
o servidor Node com `npm start`. O app usa a variavel `PORT` automaticamente,
como o Render espera.

No plano gratis, o Render pode colocar o app para dormir quando fica alguns
minutos sem acesso. O primeiro acesso depois disso pode demorar um pouco.
