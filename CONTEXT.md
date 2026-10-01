# Contexto do Projeto: SmartDrive Multispeed - Mundo Senai

## 1. Visão Geral
Este projeto é uma plataforma interativa desenvolvida para ser apresentada pelos alunos do curso de Aprendizagem Industrial de Eletrônico de Manutenção Industrial durante a feira Mundo Senai (SENAI Timbó). 
O objetivo é demonstrar o controle de múltiplas velocidades (multispeed) de um motor trifásico 220V através de um Inversor de Frequência, utilizando um aplicativo web móvel para o acionamento.

## 2. Arquitetura do Sistema
O público da feira controlará o motor usando seus próprios celulares, interagindo com uma interface web. Como o hardware local não possui módulo Wi-Fi/Bluetooth, a arquitetura foi desenhada em três camadas:

1. **Frontend (App Web):** Construído com Next.js, TypeScript e Tailwind CSS. Hospedado na Vercel. O usuário seleciona a velocidade desejada ou aperta o botão de emergência. A ação altera o estado em um banco de dados em tempo real (Firebase Realtime Database ou Firestore).
2. **Gateway/Servidor Local (Notebook da Bancada):** Um script leve (Node.js ou Python) rodando no notebook que está fisicamente conectado ao Arduino via cabo USB. Este script escuta as mudanças no Firebase e envia comandos via porta COM (Serial) para o Arduino.
3. **Firmware (Arduino Uno):** Recebe os comandos via porta Serial e aciona um módulo de 4 relés.
4. **Hardware de Potência:** Os 4 relés estão conectados às entradas digitais (DI) do Inversor de Frequência, fechando contato com a fonte 24V do próprio inversor para selecionar as lógicas de velocidade (Multispeed) pré-programadas nos parâmetros do equipamento.

## 3. Foco da Interface (UI/UX)
Como o projeto será exposto em uma feira, a interface deve ser:
- **Mobile-first:** O visitante escaneará um QR Code na bancada para abrir o site no próprio celular.
- **Visualmente Impactante e Intuitiva:** Botões grandes, feedback visual claro de qual velocidade está ativa, animações simulando o giro do motor ou gráficos de frequência (Hz).
- **Gamificada/Educacional:** Pequenos tooltips ou modais explicando de forma simples o que cada botão faz ("Você acabou de acionar o Relé 1, que manda um sinal de 24V para o Inversor...").