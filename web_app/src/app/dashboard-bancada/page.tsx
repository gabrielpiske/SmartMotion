"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ref, onValue, set } from "firebase/database";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { getFirebaseDatabase } from "@/lib/firebase";
import { useWebSerial } from "@/hooks/useWebSerial";
import {
  type MotorControlCommand,
  type MotorControlStatus,
  type SpeedLevel,
  type DirectionState,
  parseArduinoStatus,
  SPEED_CONFIG,
} from "@/lib/types";

export default function DashboardBancadaPage() {
  const [controlUrl, setControlUrl] = useState("");
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showConsole, setShowConsole] = useState(false);

  // Estados locais do Firebase e Arduino
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [lastCommand, setLastCommand] = useState<MotorControlCommand | null>(null);
  const [arduinoStatus, setArduinoStatus] = useState<MotorControlStatus | null>(null);
  const [lastSentCommand, setLastSentCommand] = useState<string>("");

  const lastProcessedTimestampRef = useRef<number>(0);
  const lastEmergencyStateRef = useRef<"ACTIVE" | "CLEAR">("CLEAR");
  
  const currentPowerRef = useRef<boolean>(false);
  const currentDirectionRef = useRef<DirectionState>("FWD");
  const currentSpeedRef = useRef<SpeedLevel>(1);
  const currentEmergencyRef = useRef<"ACTIVE" | "CLEAR">("CLEAR");

  // Callback ao receber linha da Serial (Arduino -> Navegador)
  const handleSerialLine = useCallback((line: string) => {
    const parsed = parseArduinoStatus(line);
    if (parsed) {
      setArduinoStatus(parsed);
      // Salva no nó /motorControl/status do Firebase
      try {
        const db = getFirebaseDatabase();
        set(ref(db, "motorControl/status"), parsed).catch((err) => {
          console.error("Falha ao salvar status no Firebase:", err);
        });
      } catch (err) {
        console.error("Erro de referência Firebase:", err);
      }
    }
  }, []);

  // Hook da Web Serial API
  const {
    isSupported,
    isConnected,
    isConnecting,
    portInfo,
    logs,
    connect,
    disconnect,
    send,
    clearLogs,
  } = useWebSerial({
    baudRate: 115200,
    onLineReceived: handleSerialLine,
  });

  // Atualiza referências quando status do comando muda
  useEffect(() => {
    if (lastCommand) {
      currentPowerRef.current = lastCommand.power;
      currentDirectionRef.current = lastCommand.direction;
      currentSpeedRef.current = lastCommand.speed;
      currentEmergencyRef.current = lastCommand.emergency;
    }
  }, [lastCommand]);

  // Detecta URL do app para o QR Code
  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      setControlUrl(origin);
      setCustomUrlInput(origin);
    }
  }, []);

  // Monitora alterações de Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Alterna tela cheia
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // 1. A PONTE: Escuta /motorControl/command no Firebase e envia para a Serial
  useEffect(() => {
    try {
      const db = getFirebaseDatabase();
      const commandRef = ref(db, "motorControl/command");

      const unsubscribe = onValue(
        commandRef,
        (snapshot) => {
          setFirebaseConnected(true);
          if (snapshot.exists()) {
            const cmd = snapshot.val() as MotorControlCommand;
            setLastCommand(cmd);

            // Verifica se este comando já foi despachado
            if (cmd.timestamp && cmd.timestamp > lastProcessedTimestampRef.current) {
              lastProcessedTimestampRef.current = cmd.timestamp;

              if (isConnected) {
                // Lógica de despacho para o Arduino
                if (cmd.emergency === "ACTIVE") {
                  const commandStr = "CMD:EMERGENCY";
                  send(commandStr);
                  setLastSentCommand(commandStr);
                  lastEmergencyStateRef.current = "ACTIVE";
                } else {
                  // Se estava em emergência e agora foi limpo, envia reset antes
                  if (lastEmergencyStateRef.current === "ACTIVE" && cmd.emergency === "CLEAR") {
                    send("CMD:RESET_EMERGENCY");
                    lastEmergencyStateRef.current = "CLEAR";
                  }

                  // Envia comandos de estado
                  send(`CMD:POWER:${cmd.power ? "ON" : "OFF"}`);
                  send(`CMD:DIR:${cmd.direction}`);
                  const commandStr = `CMD:SPEED:${cmd.speed}`;
                  send(commandStr);
                  
                  setLastSentCommand(`PWR:${cmd.power ? "ON" : "OFF"} | DIR:${cmd.direction} | SPD:${cmd.speed}`);
                }
              }
            }
          }
        },
        (error) => {
          console.error("Erro escuta Firebase:", error);
          setFirebaseConnected(false);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn("Firebase não inicializado na bancada:", e);
    }
  }, [isConnected, send]);

  // 2. WATCHDOG / HEARTBEAT: Manter conexão ativa com Arduino
  // O firmware do Arduino possui segurança de timeout de 5 segundos.
  // Enquanto a bancada estiver conectada, enviamos refresh periódico a cada 2 segundos.
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      // Reenvia comando atual ou mantém alive
      if (currentEmergencyRef.current === "ACTIVE") {
        send("CMD:EMERGENCY");
      } else {
        // Reenvia apenas um comando para manter vivo
        send(`CMD:SPEED:${currentSpeedRef.current}`);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected, send]);

  // Salvar URL customizada do QR Code (ex: IP local da feira ou Vercel)
  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrlInput.trim()) {
      setControlUrl(customUrlInput.trim());
      setIsEditingUrl(false);
    }
  };

  const activeSpeedConfig = SPEED_CONFIG.find(
    (s) => s.level === (arduinoStatus ? arduinoStatus.speed : (lastCommand?.speed ?? 1))
  ) || SPEED_CONFIG[0];

  const isEmergencyActive = arduinoStatus
    ? arduinoStatus.emergency === "ACTIVE"
    : lastCommand?.emergency === "ACTIVE";

  const isPowerOn = arduinoStatus
    ? arduinoStatus.power
    : lastCommand?.power ?? false;

  const currentDirection = arduinoStatus
    ? arduinoStatus.direction
    : lastCommand?.direction ?? "FWD";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans select-none">
      {/* BARRA SUPERIOR / STATUS DA BANCADA */}
      <header className="w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Identificação do Projeto */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white">SmartDrive</h1>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Gateway Bancada
              </span>
            </div>
            <p className="text-xs text-slate-400">SENAI Timbó • Mundo SENAI</p>
          </div>
        </div>

        {/* Indicadores de Conexão e Ações de Hardware */}
        <div className="flex items-center gap-3">
          {/* Badge Firebase */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              firebaseConnected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${firebaseConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            {firebaseConnected ? "Firebase Conectado" : "Aguardando Firebase"}
          </div>

          {/* Badge & Botão Web Serial */}
          {isConnected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Arduino Conectado ({portInfo || "115200 baud"})</span>
              </div>
              <button
                onClick={disconnect}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:bg-red-500/20 hover:text-red-400 border border-slate-700 transition"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={!isSupported || isConnecting}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold tracking-wide uppercase transition shadow-lg ${
                isSupported
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 active:scale-95"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {isConnecting ? "Conectando..." : "Conectar Arduino (USB)"}
            </button>
          )}

          {/* Botão Console Serial */}
          <button
            onClick={() => setShowConsole(!showConsole)}
            className={`p-2 rounded-lg border text-xs font-semibold transition ${
              showConsole
                ? "bg-slate-700 border-slate-600 text-white"
                : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
            title="Abrir Terminal Serial"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Botão Tela Cheia */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
            title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isFullscreen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0l5 0m-5 0l0 5m11 2l5 5m0 0l-5 0m5 0l0-5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* AVISO SE NAVEGADOR NÃO SUPORTAR WEB SERIAL */}
      {!isSupported && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-2.5 text-center text-xs text-red-300 font-medium">
          ⚠ Atenção: Seu navegador não suporta a <strong>Web Serial API</strong>. Para controlar o Arduino fisicamente pela porta USB, abra esta página no <strong>Google Chrome</strong> ou <strong>Microsoft Edge</strong>.
        </div>
      )}

      {/* ÁREA CENTRAL - MODO EXIBIÇÃO FEIRA / QR CODE */}
      <main className="flex-1 flex flex-col lg:flex-row items-center justify-center p-6 gap-8 max-w-7xl mx-auto w-full">
        {/* COLUNA ESQUERDA: QR CODE GIGANTE PARA VISITANTES */}
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg w-full">
          {/* Badge Chamativa */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold uppercase tracking-wider mb-4 animate-pulse">
            <span>✨ Experiência Interativa</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-2">
            Escaneie para assumir o controle!
          </h2>

          <p className="text-sm sm:text-base text-slate-400 mb-6 max-w-md">
            Aponte a câmera do seu celular e teste o controle multivelocidade do Inversor de Frequência em tempo real.
          </p>

          {/* MOLDURA ILUMINADA DO QR CODE */}
          <div className="relative group p-6 rounded-3xl bg-slate-900/90 border-2 border-slate-700/80 shadow-2xl shadow-blue-500/10 hover:border-blue-500/50 transition-all duration-300">
            {/* Glow de fundo */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500" />

            {/* Container do QR Code com fundo branco de alto contraste para leitura rápida */}
            <div className="relative bg-white p-5 rounded-2xl shadow-inner flex items-center justify-center">
              {controlUrl ? (
                <QRCodeSVG
                  value={controlUrl}
                  size={240}
                  level="H"
                  includeMargin={false}
                  className="w-48 h-48 sm:w-60 sm:h-60"
                />
              ) : (
                <div className="w-48 h-48 sm:w-60 sm:h-60 flex items-center justify-center text-slate-400 text-xs">
                  Gerando QR Code...
                </div>
              )}
            </div>

            {/* Indicador de URL configurada */}
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <span className="truncate max-w-[240px] text-blue-400 font-semibold">{controlUrl || "Detectando..."}</span>
                <button
                  onClick={() => setIsEditingUrl(!isEditingUrl)}
                  className="text-slate-500 hover:text-slate-300 text-[10px] underline underline-offset-2"
                >
                  {isEditingUrl ? "Fechar" : "Alterar IP/URL"}
                </button>
              </div>

              {/* Formulário de alteração de URL */}
              {isEditingUrl && (
                <form onSubmit={handleSaveUrl} className="mt-2 flex items-center gap-2 w-full max-w-xs">
                  <input
                    type="url"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="http://192.168.1.50:3000"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"
                  >
                    OK
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: TELEMETRIA EM TEMPO REAL DA BANCADA */}
        <div className="flex-1 flex flex-col gap-4 max-w-lg w-full">
          {/* CARD DE VELOCIDADE ATUAL DO MOTOR */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Telemetria do Motor
              </span>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  isEmergencyActive
                    ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
                    : isPowerOn
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {isEmergencyActive ? "EMERGÊNCIA ATIVA" : isPowerOn ? "MOTOR LIGADO" : "MOTOR PARADO"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-gradient-to-br ${activeSpeedConfig.color} shadow-lg`}
              >
                {activeSpeedConfig.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-black text-white">{activeSpeedConfig.label}</h3>
                  <span className="text-sm font-semibold text-slate-400">
                    (Velocidade {activeSpeedConfig.level})
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Giro: <strong className="text-slate-200">{currentDirection === "FWD" ? "Horário" : "Anti-horário"}</strong>, 
                  Frequência ajustada para aprox.{" "}
                  <strong className="text-slate-200">
                    {activeSpeedConfig.rpm > 0 ? `${activeSpeedConfig.rpm} Hz/RPM` : "0 (Repouso)"}
                  </strong>
                </p>
              </div>
            </div>
          </div>

          {/* CARD DE ESTADO DOS 4 RELÉS (Active LOW do Arduino) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Lógica dos Relés (Entradas Digitais DI)
              </span>
              <span className="text-[10px] font-mono text-slate-500">Active LOW</span>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {[
                { name: "R1", pin: "Pin 2", role: "DI1 (Energia)", on: arduinoStatus?.r1 ?? false },
                { name: "R2", pin: "Pin 3", role: "DI2 (Giro)", on: arduinoStatus?.r2 ?? false },
                { name: "R3", pin: "Pin 4", role: "DI3 (Multisp 1)", on: arduinoStatus?.r3 ?? false },
                { name: "R4", pin: "Pin 5", role: "DI4 (Multisp 2)", on: arduinoStatus?.r4 ?? false },
              ].map((relay) => (
                <div
                  key={relay.name}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300 ${
                    relay.on
                      ? "bg-emerald-500/15 border-emerald-400/80 shadow-lg shadow-emerald-500/20"
                      : "bg-slate-800/50 border-slate-700/80"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full mb-1.5 transition-all ${
                      relay.on ? "bg-emerald-400 shadow-md shadow-emerald-400 animate-pulse" : "bg-slate-700"
                    }`}
                  />
                  <span className={`text-xs font-black ${relay.on ? "text-emerald-300" : "text-slate-400"}`}>
                    {relay.name}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">{relay.pin}</span>
                  <span
                    className={`text-[9px] font-bold mt-1 px-1.5 py-0.2 rounded ${
                      relay.on ? "bg-emerald-400/20 text-emerald-300" : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {relay.on ? "ON" : "OFF"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CARD DE INFORMAÇÕES DA PONTE */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">Último Comando Despachado:</span>
              <span className="font-mono text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                {lastSentCommand || "Nenhum comando enviado ainda"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-semibold">Telemetria Arduino (Raw):</span>
              <span className="font-mono text-slate-300 text-[11px] truncate max-w-[240px]">
                {arduinoStatus?.raw || "Aguardando resposta do Arduino..."}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400 font-semibold">Segurança de Comunicação:</span>
              <span className="text-emerald-400 flex items-center gap-1 font-medium text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Watchdog Ativo (5s)
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* PAINEL INFERIOR: CONSOLE SERIAL (COLAPSÁVEL) */}
      {showConsole && (
        <aside className="w-full bg-slate-900 border-t border-slate-800 px-6 py-4 max-h-64 flex flex-col animate-fade-in-up">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">Terminal de Comunicação Serial (115200 baud)</span>
              <span className="text-slate-500">({logs.length} registros)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={clearLogs}
                className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
              >
                Limpar Logs
              </button>
              <button
                onClick={() => setShowConsole(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 pr-2 max-h-40">
            {logs.length === 0 ? (
              <p className="text-slate-600 italic">Nenhum evento registrado ainda.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-slate-600 text-[10px] select-none">[{log.timestamp}]</span>
                  <span
                    className={`font-bold select-none ${
                      log.type === "in"
                        ? "text-emerald-400"
                        : log.type === "out"
                        ? "text-blue-400"
                        : log.type === "error"
                        ? "text-red-400"
                        : "text-amber-400"
                    }`}
                  >
                    {log.type === "in" ? "RX ←" : log.type === "out" ? "TX →" : "LOG •"}
                  </span>
                  <span
                    className={`${
                      log.type === "error" ? "text-red-300" : log.type === "in" ? "text-emerald-200" : "text-slate-300"
                    }`}
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* RODAPÉ INFORMATIVO */}
      <footer className="w-full bg-slate-950/80 border-t border-slate-900 px-6 py-2.5 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
        <p>Desenvolvido para apresentação no Mundo SENAI • SENAI Timbó</p>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-blue-400 hover:underline">
            Abrir Controle Mobile (Visitante) →
          </Link>
        </div>
      </footer>
    </div>
  );
}
