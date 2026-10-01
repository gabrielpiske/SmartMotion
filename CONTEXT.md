# Contexto do Projeto: SmartDrive Multispeed - Mundo Senai

## 1. Visão Geral
Plataforma interativa para apresentação na feira Mundo Senai (SENAI Timbó) pelos alunos de Aprendizagem Industrial de Eletrônico de Manutenção Industrial. O projeto demonstra o controle multivelocidade (multispeed) de um motor trifásico 220V através de um Inversor de Frequência, utilizando um aplicativo web.

## 2. Nova Arquitetura do Sistema (Serverless / Web Serial)
Para evitar a necessidade de rodar scripts locais (Node.js) no terminal da feira, a comunicação foi simplificada usando a **Web Serial API** diretamente no navegador:

1. **Frontend Único (Next.js na Vercel):** O sistema possui dois modos de uso na mesma aplicação web:
   - **Modo Gateway (Notebook da Bancada):** O professor/aluno abre o site no notebook físico, clica em "Conectar" e o navegador gerencia a comunicação USB com o Arduino via Web Serial API. Ele também fica escutando o Firebase.
   - **Modo Controle (Celular do Visitante):** O visitante acessa o site via QR Code. Ao clicar nos botões, o app altera o estado no Firebase Realtime Database.
2. **Sincronização:** O Firebase notifica o "Modo Gateway" no notebook sobre o clique do visitante. O navegador do notebook, por sua vez, dispara o comando via Serial para o Arduino.
3. **Firmware e Hardware:** O Arduino Uno recebe o comando serial e aciona um módulo de 4 relés. Os relés fecham contato com as entradas digitais (DI) e a fonte 24V do Inversor de Frequência, selecionando as lógicas de velocidade.

## 3. Foco da Interface (UI/UX)
- Interface mobile-first, visualmente impactante, com botões grandes e feedback visual.
- Dashboard didático animado mostrando o estado dos relés (aberto/fechado).
- Botão de "Connect to Board" (exclusivo para o painel do notebook) para iniciar a comunicação Web Serial.