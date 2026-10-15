"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { ref, set, onValue } from "firebase/database";
import { getFirebaseDatabase } from "@/lib/firebase";
import {
  SESSION_PATH,
  type SpeedLevel,
  type EmergencyState,
  type DirectionState,
  type MotorControlCommand,
  type ControlSession,
} from "@/lib/types";

const MOTOR_CONTROL_PATH = "motorControl/command";

/**
 * Estado do acesso do visitante:
 * - checking: carregando a sessão do Firebase
 * - waiting:  link válido, cronômetro ainda não começou (começa no 1º comando)
 * - active:   link válido e cronômetro correndo
 * - expired:  tempo acabou ou o link foi trocado na bancada
 * - missing:  página aberta sem token (sem ser pelo QR Code)
 */
export type SessionStatus = "checking" | "waiting" | "active" | "expired" | "missing";

// Lê o token "?s=..." da URL sem causar diferença entre servidor e navegador
const subscribeNoop = () => () => {};
function useSessionTokenFromUrl(): string | null {
  return useSyncExternalStore(
    subscribeNoop,
    () => new URLSearchParams(window.location.search).get("s"),
    () => null
  );
}

export function useMotorControl() {
  const sessionToken = useSessionTokenFromUrl();

  const [power, setPower] = useState<boolean>(false);
  const [direction, setDirection] = useState<DirectionState>("FWD");
  const [currentSpeed, setCurrentSpeed] = useState<SpeedLevel>(1);
  const [emergency, setEmergency] = useState<EmergencyState>("CLEAR");
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [session, setSession] = useState<ControlSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const serverOffsetRef = useRef(0);

  // Escuta mudanças no Firebase em tempo real
  useEffect(() => {
    try {
      const db = getFirebaseDatabase();
      const commandRef = ref(db, MOTOR_CONTROL_PATH);
      const statusRef = ref(db, "motorControl/status");

      const unsubCommand = onValue(
        commandRef,
        (snapshot) => {
          setIsConnected(true);
          if (snapshot.exists()) {
            const data = snapshot.val() as MotorControlCommand;
            setPower(data.power ?? false);
            setDirection(data.direction ?? "FWD");
            setCurrentSpeed(data.speed ?? 1);
            setEmergency(data.emergency ?? "CLEAR");
          }
        },
        (error) => {
          console.error("Firebase connection error:", error);
          setIsConnected(false);
        }
      );

      const unsubStatus = onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const status = snapshot.val() as { power?: boolean; direction?: DirectionState; speed?: SpeedLevel; emergency?: EmergencyState };
          if (status.emergency === "ACTIVE") {
            setEmergency("ACTIVE");
            setPower(false);
          }
        }
      });

      // Sessão de acesso (link do QR Code)
      const unsubSession = onValue(ref(db, SESSION_PATH), (snapshot) => {
        setSession(snapshot.exists() ? (snapshot.val() as ControlSession) : null);
        setSessionLoaded(true);
      });

      // Diferença entre o relógio do celular e o do servidor (cronômetro mais preciso)
      const unsubOffset = onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
        serverOffsetRef.current = (snapshot.val() as number) || 0;
      });

      return () => {
        unsubCommand();
        unsubStatus();
        unsubSession();
        unsubOffset();
      };
    } catch (e) {
      console.warn("Firebase not initialized:", e);
    }
  }, []);

  // Relógio para a contagem regressiva
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() + serverOffsetRef.current), 1000);
    return () => clearInterval(interval);
  }, []);

  const expiresAt = session?.expiresAt ?? null;
  let sessionStatus: SessionStatus;
  if (!sessionToken) sessionStatus = "missing";
  else if (!sessionLoaded) sessionStatus = "checking";
  else if (!session || session.token !== sessionToken || !session.active) sessionStatus = "expired";
  else if (expiresAt && now >= expiresAt) sessionStatus = "expired";
  else if (expiresAt) sessionStatus = "active";
  else sessionStatus = "waiting";

  const remainingMs = sessionStatus === "active" && expiresAt ? Math.max(0, expiresAt - now) : null;
  const canControl = sessionStatus === "active" || sessionStatus === "waiting";

  const sendCommand = async (updates: Partial<MotorControlCommand>) => {
    if (emergency === "ACTIVE" && updates.emergency !== "CLEAR") return; // Bloqueado durante emergência
    // Sem sessão válida, apenas o botão de emergência continua funcionando (segurança)
    if (!canControl && updates.emergency !== "ACTIVE") return;
    setIsSending(true);
    try {
      const db = getFirebaseDatabase();
      const command: MotorControlCommand = {
        power: updates.power !== undefined ? updates.power : power,
        direction: updates.direction !== undefined ? updates.direction : direction,
        speed: updates.speed !== undefined ? updates.speed : currentSpeed,
        emergency: updates.emergency !== undefined ? updates.emergency : emergency,
        timestamp: Date.now(),
        session: sessionToken ?? "",
        source: "visitor",
      };
      await set(ref(db, MOTOR_CONTROL_PATH), command);
    } catch (error) {
      console.error("Failed to set command:", error);
    } finally {
      setIsSending(false);
    }
  };

  const togglePower = useCallback(async () => {
    await sendCommand({ power: !power });
  }, [power, direction, currentSpeed, emergency, canControl, sessionToken]);

  const toggleDirection = useCallback(async () => {
    await sendCommand({ direction: direction === "FWD" ? "REV" : "FWD" });
  }, [power, direction, currentSpeed, emergency, canControl, sessionToken]);

  const setSpeed = useCallback(async (speed: SpeedLevel) => {
    await sendCommand({ speed });
  }, [power, direction, currentSpeed, emergency, canControl, sessionToken]);

  const activateEmergency = useCallback(async () => {
    await sendCommand({ power: false, emergency: "ACTIVE" });
  }, [direction, currentSpeed, canControl, sessionToken]);

  const resetEmergency = useCallback(async () => {
    await sendCommand({ power: false, emergency: "CLEAR" });
  }, [direction, currentSpeed, canControl, sessionToken]);

  return {
    power,
    direction,
    currentSpeed,
    emergency,
    isConnected,
    isSending,
    sessionStatus,
    remainingMs,
    canControl,
    togglePower,
    toggleDirection,
    setSpeed,
    activateEmergency,
    resetEmergency,
  };
}
