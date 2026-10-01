# AGENT.md - Diretrizes para o Agente de IA (SmartDrive Multispeed)

> **Instruções de Uso:** Este arquivo serve como diretriz mestre para agentes de IA atuando na criação deste projeto de automação com Inversor de Frequência e 4 Relés.

## 1. Perfil e Responsabilidade do Agente
Você atua como **Engenheiro Full-Stack** e **Especialista em Automação Industrial e IoT**. Sua missão é desenvolver uma solução segura para apresentação em feiras de tecnologia, cobrindo:
1. **Frontend (Next.js):** Interface mobile-first para controle e exibição didática dos estados do inversor.
2. **Gateway Bridge (Node.js):** Script de ponte entre o Firebase e a porta COM (Serial) conectada ao Arduino.
3. **Firmware (C/C++):** Código para Arduino Uno com acionamento seguro de um módulo de 4 relés.

## 2. Regras Críticas de Segurança (Hardware e Inversor)
1. **Estado Seguro Padrão (Safe-Off):** Em caso de perda de conexão serial, o Arduino deve desacionar todos os 4 relés, enviando comando de parada (0 Hz) ao inversor.
2. **Emergência / Intertravamento:** A interface deve ter um botão de EMERGÊNCIA em destaque. Ao ser acionado, corta imediatamente todos os relés e bloqueia qualquer comando de velocidade até que um `RESET` seja enviado.
3. **Lógica Invertida do Módulo Relé:** Módulos de relé para Arduino costumam ser **Active LOW** (nível lógico BAIXO / `LOW` / `0V` atraca a bobina). Configure os pinos como inativos (`HIGH`) no `setup()` **antes** de definir o `pinMode()`.
4. **Isolação e Parametrização:** Apenas os contatos de saída a relé do módulo (COM e NO) entrarão em contato com o Inversor (bornes de DI e 24V). O Arduino não deve ter conexão elétrica direta com o circuito do inversor.

## 3. Protocolo Serial Padronizado
A comunicação entre o script Gateway (Notebook) e o Arduino operará a **115200 baud**, com mensagens finalizadas por quebra de linha (`\n`).

### 3.1. Comandos Web -> Arduino
| Comando | Descrição | Resposta Esperada |
| :--- | :--- | :--- |
| `CMD:SPEED:0` | Desliga o motor (todos os relés OFF) | `STATUS:SPEED=0` |
| `CMD:SPEED:1` | Aciona velocidade 1 (Relé 1 ON) | `STATUS:SPEED=1` |
| `CMD:SPEED:2` | Aciona velocidade 2 (Relé 2 ON) | `STATUS:SPEED=2` |
| `CMD:SPEED:3` | Aciona velocidade 3 (Relés 1 e 2 ON, etc.) | `STATUS:SPEED=3` |
| `CMD:EMERGENCY` | Parada imediata, bloqueia religamento | `ALERT:EMERGENCY_ACTIVATED` |
| `CMD:RESET_EMERGENCY` | Libera a trava de segurança | `INFO:EMERGENCY_RESET` |
| `CMD:STATUS` | Solicita telemetria atual | `STATUS:SPEED=[0-4],EMERG=[ACTIVE|CLEAR]` |

### 3.2. Formato de Telemetria (Arduino -> Web)
O Arduino deve notificar mudanças de estado com o formato:
`STATUS:SPEED=2,R1=ON,R2=OFF,R3=ON,R4=OFF,EMERGENCY=CLEAR`