// ============================================================
// SmartDrive Multispeed - Firmware de Controle do Inversor
// Projeto: Mundo Senai - SENAI Timbó
// ============================================================
//
// Controla 4 relés (Active LOW) para o Inversor de Frequência
// Relé 1: Liga/Desliga
// Relé 2: Sentido de Giro
// Relé 3 e 4: Multispeed (4 velocidades)
//
// Protocolo: 115200 baud, comandos delimitados por '\n'
// Segurança: Timeout de 5s sem comunicação desliga todos os relés.
//            Emergência trava o sistema até CMD:RESET_EMERGENCY.
// ============================================================

// --- Configuração de Pinos dos Relés ---
// Módulo relé Active LOW: LOW = relé acionado, HIGH = relé desligado
const int RELAY_1 = 2; // Power
const int RELAY_2 = 3; // Direction
const int RELAY_3 = 4; // Multispeed 1
const int RELAY_4 = 5; // Multispeed 2

const int NUM_RELAYS = 4;
const int RELAY_PINS[NUM_RELAYS] = { RELAY_1, RELAY_2, RELAY_3, RELAY_4 };

// --- Configuração de Segurança ---
const unsigned long SERIAL_TIMEOUT_MS = 5000; // 5 segundos sem comando = desliga tudo

// --- Estado do Sistema ---
unsigned long lastCommandTime = 0;   // Timestamp do último comando recebido
bool isPowerOn = false;              // Estado de energia
bool isForward = true;               // Sentido de giro
int currentSpeed = 1;                // Velocidade atual (1 a 4)
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
    ; // Aguarda a porta serial
  }

  lastCommandTime = millis();
  inputBuffer.reserve(64);

  // Envia estado inicial
  sendStatus();
  Serial.println("INFO:BOOT_OK");
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================
void loop() {
  processSerial();
  checkSerialTimeout();
}

// ============================================================
// PROCESSAMENTO SERIAL
// ============================================================
void processSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();

    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        inputBuffer.trim();
        handleCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      inputBuffer += c;
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
  lastCommandTime = millis();
  timeoutTriggered = false;

  // --- EMERGÊNCIA ---
  if (cmd == "CMD:EMERGENCY") {
    emergencyActive = true;
    isPowerOn = false;
    currentSpeed = 1;
    applyState();
    sendStatus();
    Serial.println("ACK:EMERGENCY_ACTIVATED");
    return;
  }

  if (cmd == "CMD:RESET_EMERGENCY") {
    if (emergencyActive) {
      emergencyActive = false;
      isPowerOn = false;
      applyState();
      sendStatus();
      Serial.println("ACK:EMERGENCY_CLEARED");
    } else {
      Serial.println("ACK:NO_EMERGENCY");
    }
    return;
  }

  // --- BLOQUEIO DE EMERGÊNCIA ---
  if (emergencyActive) {
    Serial.println("ERR:EMERGENCY_ACTIVE");
    sendStatus();
    return;
  }

  // --- COMANDOS DE CONTROLE ---
  if (cmd == "CMD:POWER:ON") {
    isPowerOn = true;
    applyState();
    sendStatus();
    Serial.println("ACK:POWER_ON");
    return;
  }
  
  if (cmd == "CMD:POWER:OFF") {
    isPowerOn = false;
    applyState();
    sendStatus();
    Serial.println("ACK:POWER_OFF");
    return;
  }

  if (cmd == "CMD:DIR:FWD") {
    isForward = true;
    applyState();
    sendStatus();
    Serial.println("ACK:DIR_FWD");
    return;
  }

  if (cmd == "CMD:DIR:REV") {
    isForward = false;
    applyState();
    sendStatus();
    Serial.println("ACK:DIR_REV");
    return;
  }

  if (cmd.startsWith("CMD:SPEED:")) {
    int speed = cmd.substring(10).toInt();
    if (speed < 1 || speed > 4) {
      Serial.println("ERR:INVALID_SPEED");
      return;
    }
    currentSpeed = speed;
    applyState();
    sendStatus();
    Serial.println("ACK:SPEED_SET");
    return;
  }

  Serial.println("ERR:UNKNOWN_CMD");
}

// ============================================================
// APLICAÇÃO DE ESTADOS NOS RELÉS
// ============================================================
void applyState() {
  if (emergencyActive || !isPowerOn) {
    setAllRelaysOff();
    return;
  }

  // R1: Liga/Desliga
  setRelay(RELAY_1, true);

  // R2: Sentido de giro (FWD = Desligado, REV = Ligado)
  setRelay(RELAY_2, !isForward);

  // R3 e R4: Multispeed (1 a 4)
  bool r3State = false;
  bool r4State = false;

  switch (currentSpeed) {
    case 1: r3State = false; r4State = false; break;
    case 2: r3State = true;  r4State = false; break;
    case 3: r3State = false; r4State = true;  break;
    case 4: r3State = true;  r4State = true;  break;
  }

  setRelay(RELAY_3, r3State);
  setRelay(RELAY_4, r4State);
}

// ============================================================
// CONTROLE INDIVIDUAL DE RELÉ (Abstração Active LOW)
// ============================================================
void setRelay(int pin, bool activate) {
  digitalWrite(pin, activate ? LOW : HIGH);
}

// ============================================================
// DESLIGA TODOS OS RELÉS (Estado seguro)
// ============================================================
void setAllRelaysOff() {
  for (int i = 0; i < NUM_RELAYS; i++) {
    digitalWrite(RELAY_PINS[i], HIGH);
  }
}

// ============================================================
// VERIFICAÇÃO DE TIMEOUT DE COMUNICAÇÃO
// ============================================================
void checkSerialTimeout() {
  if (millis() - lastCommandTime >= SERIAL_TIMEOUT_MS) {
    if (!timeoutTriggered) {
      isPowerOn = false;
      applyState();
      timeoutTriggered = true;
      Serial.println("WARN:SERIAL_TIMEOUT");
      sendStatus();
    }
  }
}

// ============================================================
// TELEMETRIA
// ============================================================
// Formato: STATUS:POWER=ON,DIR=FWD,SPEED=1,R1=ON,R2=OFF,R3=ON,R4=OFF,EMERGENCY=CLEAR
void sendStatus() {
  String status = "STATUS:";
  status += "POWER=" + String(isPowerOn ? "ON" : "OFF");
  status += ",DIR=" + String(isForward ? "FWD" : "REV");
  status += ",SPEED=" + String(currentSpeed);
  status += ",R1=" + getRelayState(RELAY_1);
  status += ",R2=" + getRelayState(RELAY_2);
  status += ",R3=" + getRelayState(RELAY_3);
  status += ",R4=" + getRelayState(RELAY_4);
  status += ",EMERGENCY=" + String(emergencyActive ? "ACTIVE" : "CLEAR");
  Serial.println(status);
}

String getRelayState(int pin) {
  return (digitalRead(pin) == LOW) ? "ON" : "OFF";
}
