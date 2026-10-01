// Tipos compartilhados do SmartDrive Multispeed

/** Velocidades possíveis do motor (0 = parado) */
export type SpeedLevel = 0 | 1 | 2 | 3;

/** Estado de emergência */
export type EmergencyState = "ACTIVE" | "CLEAR";

/** Estrutura do nó /motorControl no Firebase Realtime Database */
export interface MotorControlCommand {
  speed: SpeedLevel;
  emergency: EmergencyState;
  timestamp: number; // Date.now() - para ordering e debug
}

/** Mapa de qual relé está ligado para cada velocidade */
export const SPEED_RELAY_MAP: Record<SpeedLevel, [boolean, boolean, boolean, boolean]> = {
  0: [false, false, false, false],
  1: [true, false, false, false],
  2: [true, true, false, false],
  3: [true, true, true, false],
};

/** Metadados de cada velocidade para a UI */
export const SPEED_CONFIG = [
  {
    level: 0 as SpeedLevel,
    label: "Parado",
    sublabel: "Motor desligado",
    icon: "⏹",
    color: "from-gray-600 to-gray-700",
    activeColor: "from-gray-500 to-gray-600",
    borderColor: "border-gray-500",
    glowColor: "shadow-gray-500/30",
    textColor: "text-gray-100",
    rpm: 0,
  },
  {
    level: 1 as SpeedLevel,
    label: "Baixa",
    sublabel: "Velocidade 1",
    icon: "🟢",
    color: "from-emerald-600 to-emerald-700",
    activeColor: "from-emerald-500 to-emerald-600",
    borderColor: "border-emerald-400",
    glowColor: "shadow-emerald-500/40",
    textColor: "text-emerald-100",
    rpm: 600,
  },
  {
    level: 2 as SpeedLevel,
    label: "Média",
    sublabel: "Velocidade 2",
    icon: "🟡",
    color: "from-amber-500 to-amber-600",
    activeColor: "from-amber-400 to-amber-500",
    borderColor: "border-amber-400",
    glowColor: "shadow-amber-500/40",
    textColor: "text-amber-100",
    rpm: 1200,
  },
  {
    level: 3 as SpeedLevel,
    label: "Alta",
    sublabel: "Velocidade 3",
    icon: "🔴",
    color: "from-orange-500 to-orange-600",
    activeColor: "from-orange-400 to-orange-500",
    borderColor: "border-orange-400",
    glowColor: "shadow-orange-500/40",
    textColor: "text-orange-100",
    rpm: 1800,
  },
] as const;


/** Estrutura da telemetria do Arduino salva em /motorControl/status */
export interface MotorControlStatus {
  raw: string;
  speed: SpeedLevel;
  r1: boolean;
  r2: boolean;
  r3: boolean;
  r4: boolean;
  emergency: EmergencyState;
  updatedAt: number;
}

/** Utilitário para parsear a string de telemetria do Arduino */
export function parseArduinoStatus(line: string): MotorControlStatus | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("STATUS:")) return null;

  try {
    const payload = trimmed.substring(7); // Remove "STATUS:"
    const parts = payload.split(",");
    const map: Record<string, string> = {};

    for (const part of parts) {
      const [key, val] = part.split("=");
      if (key && val) {
        map[key.trim().toUpperCase()] = val.trim().toUpperCase();
      }
    }

    const speed = (parseInt(map["SPEED"] || "0", 10) as SpeedLevel) || 0;
    const r1 = map["R1"] === "ON";
    const r2 = map["R2"] === "ON";
    const r3 = map["R3"] === "ON";
    const r4 = map["R4"] === "ON";
    const emergency: EmergencyState = map["EMERGENCY"] === "ACTIVE" ? "ACTIVE" : "CLEAR";

    return {
      raw: trimmed,
      speed: (speed >= 0 && speed <= 3 ? speed : 0) as SpeedLevel,
      r1,
      r2,
      r3,
      r4,
      emergency,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}
