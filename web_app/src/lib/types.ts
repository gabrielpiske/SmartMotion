// Tipos compartilhados do SmartDrive Multispeed

/** Velocidades possíveis do motor (1 a 4) */
export type SpeedLevel = 1 | 2 | 3 | 4;

/** Estado de emergência */
export type EmergencyState = "ACTIVE" | "CLEAR";

/** Direção do motor */
export type DirectionState = "FWD" | "REV";

/** Estrutura do nó /motorControl no Firebase Realtime Database */
export interface MotorControlCommand {
  power: boolean;
  direction: DirectionState;
  speed: SpeedLevel;
  emergency: EmergencyState;
  timestamp: number; // Date.now() - para ordering e debug
}

/** Metadados de cada velocidade para a UI */
export const SPEED_CONFIG = [
  {
    level: 1 as SpeedLevel,
    label: "Baixa",
    sublabel: "Velocidade 1",
    icon: "🐢",
    color: "from-emerald-600 to-emerald-700",
    activeColor: "from-emerald-500 to-emerald-600",
    borderColor: "border-emerald-400",
    glowColor: "shadow-emerald-500/40",
    textColor: "text-emerald-100",
    rpm: 15,
  },
  {
    level: 2 as SpeedLevel,
    label: "Média Baixa",
    sublabel: "Velocidade 2",
    icon: "🚶",
    color: "from-lime-500 to-lime-600",
    activeColor: "from-lime-400 to-lime-500",
    borderColor: "border-lime-400",
    glowColor: "shadow-lime-500/40",
    textColor: "text-lime-100",
    rpm: 50,
  },
  {
    level: 3 as SpeedLevel,
    label: "Média Alta",
    sublabel: "Velocidade 3",
    icon: "🏃",
    color: "from-amber-500 to-amber-600",
    activeColor: "from-amber-400 to-amber-500",
    borderColor: "border-amber-400",
    glowColor: "shadow-amber-500/40",
    textColor: "text-amber-100",
    rpm: 75,
  },
  {
    level: 4 as SpeedLevel,
    label: "Alta",
    sublabel: "Velocidade 4",
    icon: "🚀",
    color: "from-orange-500 to-orange-600",
    activeColor: "from-orange-400 to-orange-500",
    borderColor: "border-orange-400",
    glowColor: "shadow-orange-500/40",
    textColor: "text-orange-100",
    rpm: 120,
  },
] as const;


/** Estrutura da telemetria do Arduino salva em /motorControl/status */
export interface MotorControlStatus {
  raw: string;
  power: boolean;
  direction: DirectionState;
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

    const power = map["POWER"] === "ON";
    const direction = map["DIR"] === "REV" ? "REV" : "FWD";
    const speed = (parseInt(map["SPEED"] || "1", 10) as SpeedLevel) || 1;
    const r1 = map["R1"] === "ON";
    const r2 = map["R2"] === "ON";
    const r3 = map["R3"] === "ON";
    const r4 = map["R4"] === "ON";
    const emergency: EmergencyState = map["EMERGENCY"] === "ACTIVE" ? "ACTIVE" : "CLEAR";

    return {
      raw: trimmed,
      power,
      direction,
      speed: (speed >= 1 && speed <= 4 ? speed : 1) as SpeedLevel,
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
