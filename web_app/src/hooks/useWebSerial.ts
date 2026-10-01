"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  type: "in" | "out" | "info" | "error";
  text: string;
}

interface UseWebSerialOptions {
  baudRate?: number;
  onLineReceived?: (line: string) => void;
}

export function useWebSerial({
  baudRate = 115200,
  onLineReceived,
}: UseWebSerialOptions = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [portInfo, setPortInfo] = useState<string | null>(null);
  const [logs, setLogs] = useState<SerialLogEntry[]>([]);

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const keepReadingRef = useRef(false);
  const onLineReceivedRef = useRef(onLineReceived);

  useEffect(() => {
    onLineReceivedRef.current = onLineReceived;
  }, [onLineReceived]);

  // Verifica suporte à Web Serial API no navegador
  useEffect(() => {
    if (typeof window !== "undefined" && "serial" in navigator) {
      setIsSupported(true);
    } else {
      setIsSupported(false);
    }
  }, []);

  const addLog = useCallback(
    (type: "in" | "out" | "info" | "error", text: string) => {
      const entry: SerialLogEntry = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        type,
        text,
      };
      setLogs((prev) => [entry, ...prev.slice(0, 99)]); // Mantém os últimos 100 logs
    },
    []
  );

  // Escuta desconexão física do cabo USB
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.serial) return;

    const handleDisconnect = () => {
      addLog("error", "Dispositivo USB desconectado!");
      setIsConnected(false);
      setPortInfo(null);
    };

    navigator.serial.addEventListener("disconnect", handleDisconnect);
    return () => {
      navigator.serial?.removeEventListener("disconnect", handleDisconnect);
    };
  }, [addLog]);

  // Função interna de leitura em loop
  const startReading = useCallback(
    async (port: SerialPort) => {
      if (!port.readable) return;

      keepReadingRef.current = true;
      let buffer = "";
      const textDecoder = new TextDecoder();

      try {
        while (keepReadingRef.current && port.readable) {
          const reader = port.readable.getReader();
          readerRef.current = reader;

          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                buffer += textDecoder.decode(value);
                const lines = buffer.split(/\r?\n/);
                // O último elemento pode ser um pedaço incompleto
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed) {
                    addLog("in", trimmed);
                    if (onLineReceivedRef.current) {
                      onLineReceivedRef.current(trimmed);
                    }
                  }
                }
              }
            }
          } catch (err) {
            if (keepReadingRef.current) {
              addLog("error", `Erro na leitura serial: ${(err as Error).message}`);
            }
          } finally {
            reader.releaseLock();
            readerRef.current = null;
          }
        }
      } catch (err) {
        if (keepReadingRef.current) {
          addLog("error", `Falha no stream de leitura: ${(err as Error).message}`);
        }
      }
    },
    [addLog]
  );

  // Conectar à porta serial
  const connect = useCallback(async () => {
    if (!navigator.serial) {
      addLog("error", "Web Serial API não é suportada neste navegador. Use Google Chrome ou Microsoft Edge.");
      return false;
    }

    setIsConnecting(true);
    addLog("info", "Solicitando porta serial ao usuário...");

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });

      portRef.current = port;
      setIsConnected(true);

      const info = port.getInfo?.();
      const infoStr = info?.usbVendorId
        ? `USB VID:${info.usbVendorId.toString(16).toUpperCase()} PID:${(info.usbProductId || 0).toString(16).toUpperCase()}`
        : "Porta Serial";
      setPortInfo(infoStr);

      addLog("info", `Conectado com sucesso (${infoStr} a ${baudRate} baud)!`);

      // Inicia leitura contínua em background
      startReading(port);
      return true;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("No port selected") || msg.includes("cancelled")) {
        addLog("info", "Seleção de porta cancelada pelo usuário.");
      } else {
        addLog("error", `Falha ao abrir porta: ${msg}`);
      }
      setIsConnected(false);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [baudRate, addLog, startReading]);

  // Desconectar da porta serial
  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch {
        // Ignora erro ao cancelar leitor
      }
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch (err) {
        addLog("error", `Erro ao fechar porta: ${(err as Error).message}`);
      }
      portRef.current = null;
    }

    setIsConnected(false);
    setPortInfo(null);
    addLog("info", "Porta serial desconectada.");
  }, [addLog]);

  // Enviar comando para o Arduino
  const send = useCallback(
    async (command: string) => {
      const port = portRef.current;
      if (!port || !port.writable) {
        addLog("error", "Não foi possível enviar: porta não conectada ou não gravável.");
        return false;
      }

      const text = command.endsWith("\n") ? command : command + "\n";
      const data = new TextEncoder().encode(text);

      try {
        const writer = port.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
        addLog("out", command.trim());
        return true;
      } catch (err) {
        addLog("error", `Erro ao enviar comando: ${(err as Error).message}`);
        return false;
      }
    },
    [addLog]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    isSupported,
    isConnected,
    isConnecting,
    portInfo,
    logs,
    connect,
    disconnect,
    send,
    clearLogs,
  };
}
