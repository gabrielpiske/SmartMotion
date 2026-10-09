"use client";

import { useState, useEffect, useCallback } from "react";
import { ref, set, onValue } from "firebase/database";
import { getFirebaseDatabase } from "@/lib/firebase";
import type { SpeedLevel, EmergencyState, DirectionState, MotorControlCommand } from "@/lib/types";

const MOTOR_CONTROL_PATH = "motorControl/command";

export function useMotorControl() {
  const [power, setPower] = useState<boolean>(false);
  const [direction, setDirection] = useState<DirectionState>("FWD");
  const [currentSpeed, setCurrentSpeed] = useState<SpeedLevel>(1);
  const [emergency, setEmergency] = useState<EmergencyState>("CLEAR");
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);

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

      return () => {
        unsubCommand();
        unsubStatus();
      };
    } catch (e) {
      console.warn("Firebase not initialized:", e);
    }
  }, []);

  const sendCommand = async (updates: Partial<MotorControlCommand>) => {
    if (emergency === "ACTIVE" && updates.emergency !== "CLEAR") return; // Bloqueado durante emergência
    setIsSending(true);
    try {
      const db = getFirebaseDatabase();
      const command: MotorControlCommand = {
        power: updates.power !== undefined ? updates.power : power,
        direction: updates.direction !== undefined ? updates.direction : direction,
        speed: updates.speed !== undefined ? updates.speed : currentSpeed,
        emergency: updates.emergency !== undefined ? updates.emergency : emergency,
        timestamp: Date.now(),
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
  }, [power, direction, currentSpeed, emergency]);

  const toggleDirection = useCallback(async () => {
    await sendCommand({ direction: direction === "FWD" ? "REV" : "FWD" });
  }, [power, direction, currentSpeed, emergency]);

  const setSpeed = useCallback(async (speed: SpeedLevel) => {
    await sendCommand({ speed });
  }, [power, direction, currentSpeed, emergency]);

  const activateEmergency = useCallback(async () => {
    await sendCommand({ power: false, emergency: "ACTIVE" });
  }, [direction, currentSpeed]);

  const resetEmergency = useCallback(async () => {
    await sendCommand({ power: false, emergency: "CLEAR" });
  }, [direction, currentSpeed]);

  return {
    power,
    direction,
    currentSpeed,
    emergency,
    isConnected,
    isSending,
    togglePower,
    toggleDirection,
    setSpeed,
    activateEmergency,
    resetEmergency,
  };
}
