# CONTEXT.md - Contexto do Projeto: SmartMotion (SmartDrive Multispeed)

## 1. Visão Geral e Propósito
O **SmartMotion** (também denominado *SmartDrive Multispeed*) é uma plataforma educacional e interativa de **Indústria 4.0**, **Acionamentos Eletrônicos** e **IoT Industrial**, concebida especialmente para apresentação na feira **Mundo SENAI (SENAI Timbó)** pelos estudantes do curso de **Aprendizagem Industrial de Eletrônico de Manutenção Industrial**.

O projeto demonstra o controle prático, seguro e em tempo real de um **motor de indução trifásico (MIT) em 220VAC** acionado por um **Inversor de Frequência Industrial**, operado remotamente pelos visitantes via smartphone através da internet, integrado a um computador de bancada física.

---

## 2. Nova Arquitetura do Sistema (Serverless / Web Serial)
Para eliminar a necessidade de servidores locais (Node.js, Python, daemons ou drivers de portas virtuais) no dia da feira, o sistema adota uma **arquitetura 100% orientada a navegador**:

```
[ Visitante (Smartphone) ] 
       │ HTTPS / WebSocket
       ▼
[ Firebase Realtime Database (/motorControl) ] 
       ▲ WebSocket
       │
[ Notebook Bancada: /dashboard-bancada (Chrome/Edge) ]
       │ Web Serial API nativa (USB @ 115200 baud)
       ▼
[ Arduino Uno R3 (Firmware C++ com Watchdog 5s) ]
       │ Pinos D2, D3, D4, D5 (Active LOW)
       ▼
[ Módulo de 4 Relés Optoacoplados ]
       │ Contatos secos COM/NO (+24VDC)
       ▼
[ Inversor de Frequência (Entradas Digitais DI1 a DI4) ]
       │ Tensão Trifásica PWM (220VAC)
       ▼
[ Motor de Indução Trifásico ]
```

1. **Frontend Único (Next.js na Vercel):**
   - **IHM do Visitante (`/`):** Interface mobile-first touch, aberta pelos visitantes ao escanear um QR Code. Permite ligar/desligar o motor, alternar sentido de giro (horário/anti-horário), selecionar entre 4 patamares de velocidade e acionar a parada de emergência.
   - **Painel Quiosque da Bancada (`/dashboard-bancada`):** Fica aberto no notebook físico da bancada em tela cheia. Exibe o QR Code de alto contraste para o público, possui o botão "Conectar Arduino (USB)" via **Web Serial API**, gerencia a ponte de comunicação bidirecional com o Firebase e apresenta um console de logs e telemetria dos relés ao vivo.
2. **Sincronização em Nuvem (Firebase Realtime Database):**
   - `/motorControl/command`: Recebe comandos despachados pelos smartphones dos visitantes.
   - `/motorControl/status`: Recebe a telemetria em malha fechada enviada pelo Arduino de volta à bancada, sincronizando todos os celulares conectados instantaneamente.
3. **Ponte Local (Web Serial API):**
   - O notebook da bancada lê o Firebase e dispara os comandos ASCII pela porta serial USB a 115.200 bps.
   - O notebook também envia um **heartbeat a cada 2 segundos** para refrescar o watchdog de segurança do microcontrolador.
4. **Firmware e Eletroeletrônica de Campo:**
   - O Arduino Uno recebe os comandos seriais e chaveia os 4 relés do módulo (lógica **Active LOW**).
   - Os contatos dos relés fecham o sinal de +24VDC do inversor nas entradas digitais DI1 a DI4.

---

## 3. Mapeamento de Hardware e Lógica de Acionamento

### 3.1. Conexões Arduino ➔ Relés ➔ Inversor
| Relé | Pino Arduino | Borne Inversor | Função | Descrição |
| :---: | :---: | :---: | :---: | :--- |
| **Relé 1** | **D2** | **DI1** | **Power (Liga/Desliga)** | Habilita a operação geral do motor (*Gira/Para*). |
| **Relé 2** | **D3** | **DI2** | **Sentido de Giro** | Alterna entre avanço (**FWD** - Relé Aberto) e retorno (**REV** - Relé Fechado). |
| **Relé 3** | **D4** | **DI3** | **Multispeed Bit 0** | Bit 0 da tabela de frequências pré-programadas no inversor. |
| **Relé 4** | **D5** | **DI4** | **Multispeed Bit 1** | Bit 1 da tabela de frequências pré-programadas no inversor. |

### 3.2. Tabela Verdade Multispeed (4 Estágios)
| Velocidade | Rótulo IHM | Relé 3 (DI3) | Relé 4 (DI4) | Frequência | Rotação Estimada (4 Polos) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | Baixa | **OFF** | **OFF** | **15 Hz** | ~450 RPM |
| **2** | Média Baixa | **ON** | **OFF** | **30 Hz** | ~900 RPM |
| **3** | Média Alta | **OFF** | **ON** | **45 Hz** | ~1350 RPM |
| **4** | Alta | **ON** | **ON** | **60 Hz** | ~1800 RPM |

> **Nota de Bancada:** Na montagem física da bancada, os relés R3 e R4 ativam as frequências 2 e 3 invertidas devido à fiação nos bornes DI3/DI4. O gateway da bancada (`/dashboard-bancada`) realiza a conversão automática (`toHardwareSpeed` / `fromHardwareSpeed`) para manter a experiência didática perfeitamente coerente.

---

## 4. Princípios de Segurança e Normas (NR-10 & NR-12)
- **Princípio Failsafe:** Relés normalmente abertos (NO). Se faltar energia, desconectar o cabo USB ou fechar a aba, o motor desarma por mola mecânica.
- **Watchdog de Comunicação de 5 Segundos:** O Arduino desliga todas as saídas automaticamente caso fique mais de 5s sem receber comandos seriais.
- **Prioridade Absoluta de Emergência:** O comando `CMD:EMERGENCY` corta imediatamente os 4 relés e bloqueia novas partidas no microcontrolador até o envio de um comando de reset explícito (`CMD:RESET_EMERGENCY`).
- **Prevenção de Glitches no Boot:** Pinos do Arduino configurados em nível alto (`HIGH`) antes de chamar `pinMode(pin, OUTPUT)` para evitar acionamentos espúrios na inicialização.
- **Isolação Galvânica Óptica:** Os operadores e visitantes interagem somente com interfaces de baixa tensão; o circuito de comando (24VDC) e de potência (220VAC) são optoisolados.