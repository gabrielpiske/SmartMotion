# AGENT.md - Diretrizes para o Agente de IA (SmartMotion / SmartDrive Multispeed)

> **Instruções de Uso:** Esta é a diretriz mestre e fonte de verdade técnica para qualquer agente de IA ou desenvolvedor atuando neste projeto.

---

## 1. Perfil e Responsabilidades do Agente
Você é um **Engenheiro Full-Stack** especialista em **Sistemas Embarcados**, **IoT Industrial** e **Web Serial API**.
- **Sem Backend Local:** A solução não possui e não deve possuir servidor local (Node.js/Python de terminal rodando na bancada).
- **Ponte Nativa no Navegador:** O notebook da bancada física atua como gateway quiosque através da página `/dashboard-bancada`, comunicando-se diretamente com a porta USB do Arduino Uno usando a **Web Serial API** nativa (Chrome/Edge).
- **Sincronização em Nuvem:** A ponte conecta a porta serial USB ao **Firebase Realtime Database** (`/motorControl`), permitindo que visitantes controlem o motor por smartphones via internet sem cabos adicionais.

---

## 2. Regras Críticas de Segurança (Hardware e Inversor)

1. **Safe-Off Padrão (Watchdog de 5s no Arduino):**
   - O firmware microcontrolado possui um temporizador de segurança (`SERIAL_TIMEOUT_MS = 5000`).
   - Se o Arduino ficar mais de 5 segundos sem receber comandos válidos pela porta serial, ele desenergiza todos os relés imediatamente (`isPowerOn = false` e `setAllRelaysOff()`).
2. **Heartbeat da Bancada (Refrescamento a cada 2s):**
   - O painel quiosque (`/dashboard-bancada`) envia periodicamente comandos de manutenção a cada 2 segundos enquanto estiver conectado, garantindo que o motor permaneça em rotação contínua enquanto o operador da bancada mantiver a sessão aberta.
   - Caso a aba seja fechada ou o cabo USB seja desconectado, o heartbeat cessa e o Arduino desliga o motor em 5 segundos por failsafe.
3. **Prioridade Absoluta de Emergência com Trava Rígida:**
   - O comando `CMD:EMERGENCY` corta imediatamente os 4 relés e bloqueia qualquer tentativa de religamento ou ajuste de velocidade no microcontrolador (retorna `ERR:EMERGENCY_ACTIVE`).
   - Para destravar o sistema, é obrigatório o envio do comando de desbloqueio `CMD:RESET_EMERGENCY`.
   - Na IHM mobile do visitante, o botão de reset exige confirmação em duas etapas para evitar religamentos acidentais.
4. **Lógica Invertida (Módulos Relé Active LOW):**
   - Os relés optoacoplados acionam em nível lógico `LOW` e desarmam em nível lógico `HIGH`.
   - **Regra de Ouro no Setup:** No arquivo C++ do Arduino, todos os pinos dos relés (D2 a D5) devem receber `digitalWrite(pin, HIGH)` **antes** da chamada `pinMode(pin, OUTPUT)`. Isso elimina qualquer pulso espúrio (*glitch*) no boot do microcontrolador.

---

## 3. Protocolo Serial Padronizado (115.200 baud)

A comunicação via Web Serial API utiliza frames ASCII delimitados por quebra de linha (`\n` ou `\r\n`) a uma taxa de transferência de **115.200 bps**.

### 3.1. Comandos: Navegador (Web Serial) ➔ Arduino
| Comando | Descrição | Comportamento no Firmware | Resposta Serial |
| :--- | :--- | :--- | :--- |
| `CMD:POWER:ON` | Liga o motor | Atraca o Relé 1 (se Emergência = CLEAR) | `ACK:POWER_ON` |
| `CMD:POWER:OFF` | Desliga o motor | Desatraca todos os 4 relés | `ACK:POWER_OFF` |
| `CMD:DIR:FWD` | Sentido Horário (Avanço) | Desatraca Relé 2 (DI2 Aberto) | `ACK:DIR_FWD` |
| `CMD:DIR:REV` | Sentido Anti-horário (Retorno) | Atraca Relé 2 (DI2 Fechado em 24V) | `ACK:DIR_REV` |
| `CMD:SPEED:1` | Velocidade 1 (15 Hz) | R3=OFF, R4=OFF (DI3 e DI4 Abertos) | `ACK:SPEED_SET` |
| `CMD:SPEED:2` | Velocidade 2 (30 Hz) | R3=ON, R4=OFF | `ACK:SPEED_SET` |
| `CMD:SPEED:3` | Velocidade 3 (45 Hz) | R3=OFF, R4=ON | `ACK:SPEED_SET` |
| `CMD:SPEED:4` | Velocidade 4 (60 Hz) | R3=ON, R4=ON (DI3 e DI4 Fechados) | `ACK:SPEED_SET` |
| `CMD:EMERGENCY` | Parada Imediata | Desarma os 4 relés e ativa a trava de segurança | `ACK:EMERGENCY_ACTIVATED` |
| `CMD:RESET_EMERGENCY` | Libera Emergência | Remove a trava lógica, mantendo o motor em repouso | `ACK:EMERGENCY_CLEARED` |

### 3.2. Telemetria e Alertas: Arduino ➔ Navegador (Web Serial)
- **Pacote de Telemetria Contínua:** Transmitido a cada mudança de estado ou comando recebido:
  ```text
  STATUS:POWER=ON,DIR=FWD,SPEED=1,R1=ON,R2=OFF,R3=OFF,R4=OFF,EMERGENCY=CLEAR
  ```
- **Respostas de Confirmação:** `ACK:POWER_ON`, `ACK:POWER_OFF`, `ACK:DIR_FWD`, `ACK:DIR_REV`, `ACK:SPEED_SET`, `ACK:EMERGENCY_ACTIVATED`, `ACK:EMERGENCY_CLEARED`, `ACK:NO_EMERGENCY`.
- **Mensagens de Erro e Alerta:**
  - `ERR:EMERGENCY_ACTIVE`: Comando rejeitado porque a emergência está travada.
  - `ERR:INVALID_SPEED`: Velocidade informada fora do intervalo permitido (1 a 4).
  - `ERR:UNKNOWN_CMD`: Sintaxe desconhecida pelo parser serial.
  - `ERR:BUFFER_OVERFLOW`: Linha serial excedeu o tamanho do buffer de entrada.
  - `WARN:SERIAL_TIMEOUT`: Disparo do temporizador de inatividade de 5s (Safe-Off).
  - `INFO:BOOT_OK`: Inicialização segura do microcontrolador concluída.

### 3.3. Mapeamento de Hardware da Bancada Física
Na bancada física instalada no SENAI, os relés R3 e R4 ativam as frequências 2 e 3 invertidas devido à fiação nos bornes DI3/DI4. O gateway da bancada (`/dashboard-bancada/page.tsx`) implementa as seguintes funções de translação para manter a coerência da IHM:
```typescript
const toHardwareSpeed = (speed: SpeedLevel): number => {
  if (speed === 2) return 3;
  if (speed === 3) return 2;
  return speed;
};

const fromHardwareSpeed = (hwSpeed: number): SpeedLevel => {
  if (hwSpeed === 2) return 3;
  if (hwSpeed === 3) return 2;
  return (hwSpeed >= 1 && hwSpeed <= 4 ? hwSpeed : 1) as SpeedLevel;
};
```

---

## 4. Estrutura de Dados no Firebase Realtime Database

Toda a troca de informações entre a IHM móvel e o computador da bancada é centralizada em `/motorControl`:

### 4.1. Nó `/motorControl/command` (Smartphone ➔ Bancada)
```json
{
  "power": true,
  "direction": "FWD",
  "speed": 2,
  "emergency": "CLEAR",
  "timestamp": 1728945600000
}
```

### 4.2. Nó `/motorControl/status` (Bancada/Arduino ➔ Smartphone)
```json
{
  "raw": "STATUS:POWER=ON,DIR=FWD,SPEED=2,R1=ON,R2=OFF,R3=ON,R4=OFF,EMERGENCY=CLEAR",
  "power": true,
  "direction": "FWD",
  "speed": 2,
  "r1": true,
  "r2": false,
  "r3": true,
  "r4": false,
  "emergency": "CLEAR",
  "updatedAt": 1728945600120
}
```

---

## 5. Estrutura do Código-Fonte e Papel dos Arquivos

```
SmartMotion/
├── arduino_firmware/
│   └── inversor_control.ino         # Firmware C++ do Arduino Uno (Active LOW, Watchdog, Parser)
├── web_app/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # IHM touch mobile do visitante
│   │   │   ├── dashboard-bancada/
│   │   │   │   └── page.tsx         # Quiosque da bancada: Web Serial, QR Code, Logs e Telemetria
│   │   │   ├── layout.tsx           # Layout raiz com metadata e viewport PWA
│   │   │   └── globals.css          # Estilos Tailwind CSS 4 e tema industrial escuro
│   │   ├── components/
│   │   │   ├── PowerDirectionControl.tsx # Botoeira Liga/Desliga e Sentido de Giro
│   │   │   ├── SpeedControl.tsx          # Seletor de 4 velocidades multispeed
│   │   │   ├── RelayDashboard.tsx        # Diagrama animado dos 4 relés
│   │   │   ├── EmergencyButton.tsx       # Cogumelo de emergência com confirmação de reset
│   │   │   └── ConnectionStatus.tsx      # Indicador de conexão com o Firebase
│   │   ├── hooks/
│   │   │   ├── useMotorControl.ts   # Sincronização em tempo real via Firebase
│   │   │   └── useWebSerial.ts      # Driver nativo da Web Serial API no navegador
│   │   ├── lib/
│   │   │   ├── firebase.ts          # Inicialização segura do Firebase (com fallback para SSG)
│   │   │   └── types.ts             # Tipos TypeScript, constantes e parser serial
│   │   └── types/
│   │       ├── next-shim.d.ts       # Declarações para ambiente Next.js
│   │       └── serial.d.ts          # Tipagens para a Web Serial API
│   ├── .env.local.example           # Modelo das variáveis do Firebase
│   └── package.json                 # Dependências (Next.js 16, React 19, Firebase, qrcode.react)
├── AGENT.md                         # Diretrizes operacionais para IAs e desenvolvedores
├── CONTEXT.md                       # Contexto institucional e visão de engenharia do projeto
└── README.md                        # Documentação completa, esquemáticos e guia operacional
```

---

## 6. Procedimento de Validação e Teste
Sempre que fizer alterações no código do `web_app`, execute a verificação estática de tipos e build para garantir compatibilidade com a Vercel:
```bash
cd web_app
npm run build
```
O build deve concluir com status de sucesso (**exit code 0**), sem erros de TypeScript ou problemas de pré-renderização estática (SSG).