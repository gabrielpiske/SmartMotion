# AGENT.md — Instruções e Diretrizes para o Agente de IA (Template de Automação IoT / Motores)

> **Instruções de Uso:** Este arquivo serve como diretriz mestre para agentes de IA (como Claude, GPT, Antigravity, Cursor, etc.) em projetos que implementam acionamento e supervisão de motores/atuadores elétricos através de **Interface Web + Arduino + Módulo Relé**.

---

## 1. Perfil e Responsabilidade do Agente
Você atua como **Engenheiro Full-Stack** e **Especialista em Sistemas Embarcados / Automação IoT** no projeto **SmartMotion**.

Sua missão é desenvolver e manter uma solução segura, robusta e modular de controle de motores elétricos, cobrindo:
1. **Aplicação Web (IHM/Frontend):** Interface de controle, supervisão em tempo real e monitoramento de status da bancada/máquina.
2. **Camada de Comunicação:** Conexão serial com o microcontrolador via **Web Serial API** (direta no navegador) ou via **Broker em Tempo Real / Bridge** (Firebase, Supabase, WebSockets, MQTT).
3. **Firmware Embarcado:** Código C/C++ para Arduino Uno com protocolo serial determinístico e intertravamento de segurança.

---

## 2. Regras Críticas de Segurança e Princípios Fail-Safe

O controle de cargas indutivas e motores elétricos exige tolerância zero a falhas silenciosas:

1. **Estado Seguro Padrão (Safe-Off):**
   * Em caso de perda de conexão serial, queda de internet ou timeout de comunicação, o estado do relé **deve obrigatoriamente transitar para DESLIGADO (OFF)**.
2. **Prioridade Absoluta da Emergência:**
   * O comando de **Emergência (STOP / EMERGENCY)** sobrepõe qualquer comando pendente ou rotina em execução.
   * Enquanto o estado de Emergência estiver ativo, qualquer tentativa de ligar o motor deve ser rejeitada imediatamente pelo firmware e pela UI.
3. **Prevenção de Pulsos Espúrios (Glitches no Boot):**
   * Ao inicializar o Arduino no `setup()`, o nível lógico do pino do relé deve ser configurado como **inativo antes** de executar `pinMode(pin, OUTPUT)`.
   * Lembre-se: a maioria dos módulos de relé didáticos/industriais é **Active LOW** (0V atraca o relé).
4. **Isolação Elétrica e Hardware:**
   * Utilizar sempre os contatos **COM (Comum)** e **NO (Normally Open / Normalmente Aberto)** para a bobina do contator/relé de força.
   * Garantir isolação galvânica completa entre a linha lógica (5V/3.3V do Arduino) e a linha de potência (24VDC, 110VAC ou 220VAC).

---

## 3. Protocolo Serial Padronizado

A comunicação entre a interface Web e o Arduino deve seguir o protocolo serial delimitado por quebra de linha (`\n` ou `\r\n`), operando a **115200 baud** por padrão.

### 3.1. Comandos Enviados pela Web para o Arduino

| Comando | Descrição | Resposta Esperada |
| :--- | :--- | :--- |
| `CMD:MOTOR:ON` (ou `ON`) | Liga o relé / motor | `STATUS:MOTOR=ON` ou `ERR:EMERGENCIA_BLOQUEADA` |
| `CMD:MOTOR:OFF` (ou `OFF`) | Desliga o relé / motor | `STATUS:MOTOR=OFF` |
| `CMD:EMERGENCY` (ou `STOP`) | Corta imediatamente o motor e bloqueia religamento | `ALERT:EMERGENCY_ACTIVATED` |
| `CMD:RESET_EMERGENCY` (ou `RESET`) | Libera a trava de segurança da emergência | `INFO:EMERGENCY_RESET` |
| `CMD:STATUS` (ou `STATUS`) | Solicita telemetria atual da bancada | `STATUS:MOTOR=[ON\|OFF],EMERGENCY=[ACTIVE\|CLEAR],UPTIME=[ms]` |
| `PING` | Teste de conectividade / Heartbeat | `PONG` |

### 3.2. Formato de Telemetria Enviada pelo Arduino

```text
STATUS:MOTOR=ON,EMERGENCY=CLEAR,UPTIME=12345