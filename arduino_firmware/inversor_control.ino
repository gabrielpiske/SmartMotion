// ============================================================
// SmartDrive Multispeed - Firmware de Controle do Inversor
// Projeto: Mundo Senai - SENAI Timbó
// ============================================================
//
// Controla 4 relés (Active LOW) para selecionar velocidades
// de um Inversor de Frequência via comandos serial (Web Serial API).
//
// Protocolo: 115200 baud, comandos delimitados por '\n'
// Segurança: Timeout de 5s sem comunicação desliga todos os relés.
//            Emergência trava o sistema até CMD:RESET_EMERGENCY.
// ============================================================

// --- Configuração de Pinos dos Relés ---
// Módulo relé Active LOW: LOW = relé acionado, HIGH = relé desligado
const int RELAY_1 = 2;
const int RELAY_2 = 3;
const int RELAY_3 = 4;
const int RELAY_4 = 5;

const int NUM_RELAYS = 4;
const int RELAY_PINS[NUM_RELAYS] = { RELAY_1, RELAY_2, RELAY_3, RELAY_4 };

// --- Configuração de Segurança ---
const unsigned long SERIAL_TIMEOUT_MS = 5000; // 5 segundos sem comando = desliga tudo

// --- Estado do Sistema ---
unsigned long lastCommandTime = 0;   // Timestamp do último comando recebido
int currentSpeed = 0;                // Velocidade atual (0 = desligado)
bool emergencyActive = false;        // Flag de emergência (trava até RESET)
bool timeoutTriggered = false;       // Flag para evitar spam de telemetria no timeout
String inputBuffer = "";             // Buffer para leitura serial incremental

// ============================================================
// SETUP
// ============================================================
void setup() {
  // IMPORTANTE: Colocar pinos em HIGH (relés desligados) ANTES
  // de configurar como OUTPUT, evitando pulsos espúrios na
  // energização do Arduino (regra de segurança Active LOW).
  for (int i = 0; i < NUM_RELAYS; i++) {
    digitalWrite(RELAY_PINS[i], HIGH);
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], HIGH); // Reforça estado seguro
  }

  Serial.begin(115200);
  while (!Serial) {
    ; // Aguarda a porta serial (relevante para placas com USB nativa)
  }

  lastCommandTime = millis();
  inputBuffer.reserve(64); // Pré-aloca memória para o buffer

  // Envia estado inicial
  sendStatus();

  Serial.println("INFO:BOOT_OK");
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================
void loop() {
  // 1. Leitura de comandos seriais
  processSerial();

  // 2. Verificação do timeout de comunicação
  checkSerialTimeout();
}

// ============================================================
// PROCESSAMENTO SERIAL
// ============================================================
void processSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();

    if (c == '\n' || c == '\r') {
      // Ignora linhas vazias (ex: \r\n envia dois delimitadores)
      if (inputBuffer.length() > 0) {
        inputBuffer.trim();
        handleCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;

      // Proteção contra buffer overflow por dados malformados
      if (inputBuffer.length() > 48) {
        inputBuffer = "";
        Serial.println("ERR:BUFFER_OVERFLOW");
      }
    }
  }
}

// ============================================================
// TRATAMENTO DE COMANDOS
// ============================================================
void handleCommand(const String& cmd) {
  // Qualquer comando válido recebido reseta o timer de timeout
  lastCommandTime = millis();
  timeoutTriggered = false;

  // --- CMD:EMERGENCY ---
  // Prioridade máxima: desliga tudo e trava o sistema
  if (cmd == "CMD:EMERGENCY") {
    emergencyActive = true;
    currentSpeed = 0;
    setAllRelaysOff();
    sendStatus();
    Serial.println("ACK:EMERGENCY_ACTIVATED");
    return;
  }

  // --- CMD:RESET_EMERGENCY ---
  // Libera a trava de emergência (não religa nada, apenas desbloqueia)
  if (cmd == "CMD:RESET_EMERGENCY") {
    if (emergencyActive) {
      emergencyActive = false;
      currentSpeed = 0;
      setAllRelaysOff(); // Mantém desligado até novo comando de velocidade
      sendStatus();
      Serial.println("ACK:EMERGENCY_CLEARED");
    } else {
      Serial.println("ACK:NO_EMERGENCY");
    }
    return;
  }

  // --- CMD:SPEED:X ---
  // Bloqueia comandos de velocidade se emergência estiver ativa
  if (cmd.startsWith("CMD:SPEED:")) {
    if (emergencyActive) {
      Serial.println("ERR:EMERGENCY_ACTIVE");
      sendStatus();
      return;
    }

    int speed = cmd.substring(10).toInt();

    // Validação do valor recebido
    // (toInt() retorna 0 para strings inválidas, o que coincide
    //  com SPEED:0, então validamos o caractere original)
    String speedStr = cmd.substring(10);
    if (speedStr.length() != 1 || speedStr[0] < '0' || speedStr[0] > '3') {
      Serial.println("ERR:INVALID_SPEED");
      return;
    }

    currentSpeed = speed;
    applySpeed(currentSpeed);
    sendStatus();
    Serial.println("ACK:SPEED_SET");
    return;
  }

  // --- Comando desconhecido ---
  Serial.println("ERR:UNKNOWN_CMD");
}

// ============================================================
// MAPEAMENTO DE VELOCIDADES PARA RELÉS
// ============================================================
// Tabela de combinação dos relés para cada velocidade.
// Cada velocidade aciona uma combinação diferente de relés
// que corresponde às entradas digitais (DI) do inversor.
//
// Velocidade 0 (Desligado): Todos os relés OFF
// Velocidade 1 (Baixa):     Relé 1 ON
// Velocidade 2 (Média):     Relé 1 ON + Relé 2 ON
// Velocidade 3 (Alta):      Relé 1 ON + Relé 2 ON + Relé 3 ON
//
// Relé 4: Reservado (sentido de giro ou função futura)
// ============================================================
void applySpeed(int speed) {
  // Desliga todos os relés primeiro (transição segura)
  setAllRelaysOff();

  // Pequeno delay para garantir que os relés desenergizem antes
  // de acionar a nova combinação (evita curto-circuito lógico no inversor)
  delay(50);

  switch (speed) {
    case 0:
      // Tudo desligado (já feito acima)
      break;

    case 1:
      // Velocidade baixa: apenas Relé 1
      setRelay(RELAY_1, true);
      break;

    case 2:
      // Velocidade média: Relé 1 + Relé 2
      setRelay(RELAY_1, true);
      setRelay(RELAY_2, true);
      break;

    case 3:
      // Velocidade alta: Relé 1 + Relé 2 + Relé 3
      setRelay(RELAY_1, true);
      setRelay(RELAY_2, true);
      setRelay(RELAY_3, true);
      break;
  }
}

// ============================================================
// CONTROLE INDIVIDUAL DE RELÉ (Abstração Active LOW)
// ============================================================
// Abstrai a lógica invertida do módulo relé.
//   activate = true  -> relé LIGADO  -> pino LOW
//   activate = false -> relé DESLIGADO -> pino HIGH
void setRelay(int pin, bool activate) {
  digitalWrite(pin, activate ? LOW : HIGH);
}

// ============================================================
// DESLIGA TODOS OS RELÉS (Estado seguro)
// ============================================================
void setAllRelaysOff() {
  for (int i = 0; i < NUM_RELAYS; i++) {
    digitalWrite(RELAY_PINS[i], HIGH); // HIGH = relé desligado (Active LOW)
  }
}

// ============================================================
// VERIFICAÇÃO DE TIMEOUT DE COMUNICAÇÃO
// ============================================================
// Se mais de 5 segundos se passam sem nenhum comando serial,
// o sistema assume perda de conexão e desliga tudo por segurança.
void checkSerialTimeout() {
  if (millis() - lastCommandTime >= SERIAL_TIMEOUT_MS) {
    if (!timeoutTriggered) {
      // Desliga tudo por segurança
      currentSpeed = 0;
      setAllRelaysOff();
      timeoutTriggered = true;

      Serial.println("WARN:SERIAL_TIMEOUT");
      sendStatus();
    }
    // Nota: NÃO ativa emergencyActive. O timeout é um desligamento
    // automático por segurança, mas o sistema pode retomar operação
    // normal assim que um novo comando chegar (diferente da emergência
    // que exige CMD:RESET_EMERGENCY explícito).
  }
}

// ============================================================
// TELEMETRIA - Envia status atual para a Web Serial
// ============================================================
// Formato: STATUS:SPEED=X,R1=ON,R2=OFF,R3=ON,R4=OFF,EMERGENCY=CLEAR
void sendStatus() {
  String status = "STATUS:";
  status += "SPEED=" + String(currentSpeed);
  status += ",R1=" + getRelayState(RELAY_1);
  status += ",R2=" + getRelayState(RELAY_2);
  status += ",R3=" + getRelayState(RELAY_3);
  status += ",R4=" + getRelayState(RELAY_4);
  status += ",EMERGENCY=" + String(emergencyActive ? "ACTIVE" : "CLEAR");
  Serial.println(status);
}

// Retorna "ON" ou "OFF" baseado no estado real do pino
// (lê o registrador de saída, compatível com Active LOW)
String getRelayState(int pin) {
  // digitalRead em pino OUTPUT lê o valor do registrador.
  // Active LOW: LOW = relé ligado = "ON"
  return (digitalRead(pin) == LOW) ? "ON" : "OFF";
}
