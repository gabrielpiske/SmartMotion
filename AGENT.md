# AGENT.md - Diretrizes para o Agente de IA (SmartDrive Multispeed via Web Serial)

> **Instruções de Uso:** Diretriz mestre para agentes de IA neste projeto de automação didática.

## 1. Perfil e Responsabilidade
Você é um **Engenheiro Full-Stack** especialista em **Web Serial API** e Sistemas Embarcados. A solução não terá backend local (Node.js/Python). A ponte serial será feita 100% no client-side do navegador usando a API nativa do browser.

## 2. Regras Críticas de Segurança (Hardware e Inversor)
1. **Safe-Off Padrão:** Sem comandos seriais por mais de 5 segundos (timeout), o Arduino deve desligar todos os 4 relés por segurança.
2. **Prioridade de Emergência:** A interface e o hardware devem tratar o botão de EMERGÊNCIA como prioridade máxima, cortando os relés e bloqueando religamentos até um comando de `RESET`.
3. **Lógica Invertida (Módulos Relé):** Módulos relé para Arduino costumam ser **Active LOW** (nível `LOW` atraca a bobina). Configure os pinos como inativos (`HIGH`) no `setup()` **antes** de definir o `pinMode()`.

## 3. Protocolo Serial Padronizado (115200 baud)
A comunicação via Web Serial API usará strings simples delimitadas por `\n`.

### 3.1. Comandos Web -> Arduino
- `CMD:SPEED:0` (Desliga o motor)
- `CMD:SPEED:1` a `CMD:SPEED:3` (Aciona combinações de relés para multispeed)
- `CMD:EMERGENCY` (Parada imediata)
- `CMD:RESET_EMERGENCY` (Libera a emergência)

### 3.2. Telemetria Arduino -> Web (Enviada a cada mudança ou por polling)
`STATUS:SPEED=2,R1=ON,R2=OFF,R3=ON,R4=OFF,EMERGENCY=CLEAR`