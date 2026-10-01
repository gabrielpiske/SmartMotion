"use client";

import { useState, useEffect, useCallback } from "react";
import { ref, set, onValue } from "firebase/database";
import { getFirebaseDatabase } from "@/lib/firebase";
import type { SpeedLevel, EmergencyState, MotorControlCommand } from "@/lib/types";

const MOTOR_CONTROL_PATH = "motorControl/command";

export function useMotorControl() {
  const [currentSpeed, setCurrentSpeed] = useState<SpeedLevel>(0);
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
            setCurrentSpeed(data.speed);
            setEmergency(data.emergency);
          }
        },
        (error) => {
          console.error("Firebase connection error:", error);
          setIsConnected(false);
        }
      );

      const unsubStatus = onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
          const status = snapshot.val() as { speed?: SpeedLevel; emergency?: EmergencyState };
          if (status.emergency === "ACTIVE") {
            setEmergency("ACTIVE");
            setCurrentSpeed(0);
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

  // Envia comando de velocidade
  const setSpeed = useCallback(
    async (speed: SpeedLevel) => {
      if (emergency === "ACTIVE") return; // Bloqueado durante emergência
      setIsSending(true);
      try {
        const db = getFirebaseDatabase();
        const command: MotorControlCommand = {
          speed,
          emergency: "CLEAR",
          timestamp: Date.now(),
        };
        await set(ref(db, MOTOR_CONTROL_PATH), command);
      } catch (error) {
        console.error("Failed to set speed:", error);
      } finally {
        setIsSending(false);
      }
    },
    [emergency]
  );

  // Ativa emergência
  const activateEmergency = useCallback(async () => {
    setIsSending(true);
    try {
      const db = getFirebaseDatabase();
      const command: MotorControlCommand = {
        speed: 0,
        emergency: "ACTIVE",
        timestamp: Date.now(),
      };
      await set(ref(db, MOTOR_CONTROL_PATH), command);
    } catch (error) {
      console.error("Failed to activate emergency:", error);
    } finally {
      setIsSending(false);
    }
  }, []);

  // Reseta emergência
  const resetEmergency = useCallback(async () => {
    setIsSending(true);
    try {
      const db = getFirebaseDatabase();
      const command: MotorControlCommand = {
        speed: 0,
        emergency: "CLEAR",
        timestamp: Date.now(),
      };
      await set(ref(db, MOTOR_CONTROL_PATH), command);
    } catch (error) {
      console.error("Failed to reset emergency:", error);
    } finally {
      setIsSending(false);
    }
  }, []);

  return {
    currentSpeed,
    emergency,
    isConnected,
    isSending,
    setSpeed,
    activateEmergency,
    resetEmergency,
  };
}
