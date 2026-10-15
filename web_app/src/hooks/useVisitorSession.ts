"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ref, onValue, set, get } from "firebase/database";
import { getFirebaseDatabase } from "@/lib/firebase";
import {
  SESSION_PATH,
  generateSessionToken,
  type ControlSession,
  type MotorControlCommand,
  type DirectionState,
  type SpeedLevel,
  type EmergencyState,
} from "@/lib/types";

const MOTOR_CONTROL_PATH = "motorControl/command";
const SETTINGS_KEY = "smartmotion.sessionSettings";

export const SESSION_DURATION_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30] as const;

interface SessionSettings {
  durationMin: number;
  autoRenew: boolean;
  stopOnReset: boolean;
}

const DEFAULT_SETTINGS: SessionSettings = { durationMin: 5, autoRenew: true, stopOnReset: true };

interface UseVisitorSessionOptions {
  /** Estado atual da máquina, usado para montar o comando de parada ao trocar de visitante */
  getCurrentState: () => { direction: DirectionState; speed: SpeedLevel; emergency: EmergencyState };
}

/**
 * Gerencia o acesso temporário dos visitantes (lado da bancada).
 *
 * - Cada link/QR Code tem um token único salvo em /motorControl/session.
 * - O cronômetro começa no primeiro comando do visitante.
 * - Ao expirar (ou ao clicar em "novo link"), o token é trocado: o link antigo
 *   deixa de funcionar e um novo QR Code é exibido.
 * - A comunicação serial com o Arduino não é interrompida.
 */
export function useVisitorSession({ getCurrentState }: UseVisitorSessionOptions) {
  const [session, setSession] = useState<ControlSession | null>(null);
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(() => Date.now());

  const sessionRef = useRef<ControlSession | null>(null);
  const settingsRef = useRef<SessionSettings>(DEFAULT_SETTINGS);
  const serverOffsetRef = useRef(0);
  const expiringRef = useRef(false);
  const getCurrentStateRef = useRef(getCurrentState);
  useEffect(() => {
    getCurrentStateRef.current = getCurrentState;
  }, [getCurrentState]);

  const serverNow = () => Date.now() + serverOffsetRef.current;

  const writeSession = useCallback(async (next: ControlSession) => {
    sessionRef.current = next; // atualiza imediatamente para a validação dos comandos
    setSession(next);
    await set(ref(getFirebaseDatabase(), SESSION_PATH), next);
  }, []);

  /** Envia "desligar motor" em nome da bancada (mantém sentido, velocidade e emergência) */
  const stopMotor = useCallback(async (token: string) => {
    const state = getCurrentStateRef.current();
    const command: MotorControlCommand = {
      power: false,
      direction: state.direction,
      speed: state.speed,
      emergency: state.emergency,
      timestamp: Date.now(),
      session: token,
      source: "bridge",
    };
    await set(ref(getFirebaseDatabase(), MOTOR_CONTROL_PATH), command);
  }, []);

  /** Encerra o link atual e gera um novo QR Code */
  const newSession = useCallback(async () => {
    const token = generateSessionToken();
    const next: ControlSession = {
      token,
      active: true,
      durationMs: settingsRef.current.durationMin * 60_000,
      createdAt: serverNow(),
      startedAt: null,
      expiresAt: null,
    };
    await writeSession(next);
    if (settingsRef.current.stopOnReset) await stopMotor(token);
  }, [writeSession, stopMotor]);

  /** Encerra o link atual sem gerar outro (QR Code fica bloqueado) */
  const endSession = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    await writeSession({ ...current, active: false });
    if (settingsRef.current.stopOnReset) await stopMotor(current.token);
  }, [writeSession, stopMotor]);

  /** Dá mais tempo ao visitante atual */
  const extendSession = useCallback(async (ms: number) => {
    const current = sessionRef.current;
    if (!current || !current.active) return;
    if (current.expiresAt) {
      await writeSession({ ...current, expiresAt: Math.max(current.expiresAt, serverNow()) + ms });
    } else {
      await writeSession({ ...current, durationMs: current.durationMs + ms });
    }
  }, [writeSession]);

  /** Verifica se um comando vindo do Firebase pode ser repassado ao Arduino */
  const isCommandAllowed = useCallback((cmd: MotorControlCommand): boolean => {
    // Parada de emergência é sempre aceita, de qualquer celular (segurança em primeiro lugar)
    if (cmd.emergency === "ACTIVE") return true;
    const s = sessionRef.current;
    if (!s || !cmd.session || cmd.session !== s.token) return false;
    if (cmd.source === "bridge") return true;
    if (!s.active) return false;
    if (s.expiresAt && serverNow() >= s.expiresAt) return false;
    return true;
  }, []);

  /** Primeiro comando do visitante: inicia o cronômetro */
  const registerVisitorCommand = useCallback((cmd: MotorControlCommand) => {
    const s = sessionRef.current;
    if (!s || cmd.source === "bridge" || cmd.session !== s.token || s.startedAt) return;
    const startedAt = serverNow();
    writeSession({ ...s, startedAt, expiresAt: startedAt + s.durationMs }).catch(console.error);
  }, [writeSession]);

  const updateSettings = useCallback((patch: Partial<SessionSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {}
    // Nova duração vale também para o link atual, se o visitante ainda não começou
    const s = sessionRef.current;
    if (patch.durationMin && s && s.active && !s.startedAt) {
      writeSession({ ...s, durationMs: patch.durationMin * 60_000 }).catch(console.error);
    }
  }, [writeSession]);

  // Inicialização: carrega preferências, sincroniza relógio e sessão
  useEffect(() => {
    const db = getFirebaseDatabase();

    const unsubOffset = onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
      serverOffsetRef.current = (snap.val() as number) || 0;
    });

    const unsubSession = onValue(ref(db, SESSION_PATH), (snap) => {
      const value = snap.exists() ? (snap.val() as ControlSession) : null;
      if (value) {
        value.startedAt = value.startedAt ?? null;
        value.expiresAt = value.expiresAt ?? null;
      }
      sessionRef.current = value;
      setSession(value);
    });

    // Reaproveita a sessão existente (ex.: página recarregada) ou cria uma nova
    get(ref(db, SESSION_PATH))
      .then((snap) => {
        try {
          const saved = localStorage.getItem(SETTINGS_KEY);
          if (saved) {
            const parsed = { ...DEFAULT_SETTINGS, ...(JSON.parse(saved) as Partial<SessionSettings>) };
            settingsRef.current = parsed;
            setSettings(parsed);
          }
        } catch {}

        const existing = snap.exists() ? (snap.val() as ControlSession) : null;
        const stillValid =
          existing && existing.active && (!existing.expiresAt || existing.expiresAt > serverNow());
        if (!stillValid) return newSession();
      })
      .catch((err) => console.error("Falha ao carregar sessão:", err));

    return () => {
      unsubOffset();
      unsubSession();
    };
  }, [newSession]);

  // Relógio + expiração automática
  useEffect(() => {
    const interval = setInterval(() => {
      const t = serverNow();
      setNow(t);
      const s = sessionRef.current;
      if (s && s.active && s.expiresAt && t >= s.expiresAt && !expiringRef.current) {
        expiringRef.current = true;
        const action = settingsRef.current.autoRenew ? newSession() : endSession();
        action
          .catch((err) => console.error("Falha ao renovar sessão:", err))
          .finally(() => {
            expiringRef.current = false;
          });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [newSession, endSession]);

  const remainingMs =
    session?.active && session.expiresAt ? Math.max(0, session.expiresAt - now) : null;

  return {
    session,
    remainingMs,
    settings,
    updateSettings,
    newSession,
    endSession,
    extendSession,
    isCommandAllowed,
    registerVisitorCommand,
  };
}
