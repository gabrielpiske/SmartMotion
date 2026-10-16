"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ref, onValue, set } from "firebase/database";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { getFirebaseDatabase } from "@/lib/firebase";
import { useWebSerial } from "@/hooks/useWebSerial";
import MediaPlaceholder from "@/components/MediaPlaceholder";
import { useVisitorSession, SESSION_DURATION_OPTIONS } from "@/hooks/useVisitorSession";
import {
  type MotorControlCommand,
  type MotorControlStatus,
  type SpeedLevel,
  type DirectionState,
  parseArduinoStatus,
  SPEED_CONFIG,
} from "@/lib/types";

// Mapeia velocidade lógica (UI) -> velocidade de hardware (Arduino)
// Na bancada física, os relés R3 e R4 acionam as velocidades 2 e 3 invertidas
const toHardwareSpeed = (speed: SpeedLevel): number => {
  if (speed === 2) return 3;
  if (speed === 3) return 2;
  return speed;
};

const fromHardwareSpeed = (hwSpeed: number): SpeedLevel => {
  if (hwSpeed === 2) return 3;
  if (hwSpeed === 3) return 2;
  return (hwSpeed >= 1 && hwSpeed <= 4 ? hwSpeed : 1) as SpeedLevel;
};

// Formata milissegundos como m:ss (contagem regressiva do visitante)
const formatDuration = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
};

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

  const lastSentPowerRef = useRef<boolean | null>(null);
  const lastSentDirRef = useRef<DirectionState | null>(null);
  const lastSentSpeedRef = useRef<SpeedLevel | null>(null);

  // Callback ao receber linha da Serial (Arduino -> Navegador)
  const handleSerialLine = useCallback((line: string) => {
    const parsed = parseArduinoStatus(line);
    if (parsed) {
      // Ajusta velocidade de hardware para velocidade lógica da UI
      const corrected: MotorControlStatus = {
        ...parsed,
        speed: fromHardwareSpeed(parsed.speed),
      };
      setArduinoStatus(corrected);
      // Salva no nó /motorControl/status do Firebase
      try {
        const db = getFirebaseDatabase();
        set(ref(db, "motorControl/status"), corrected).catch((err) => {
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

  // CONTROLE DE ACESSO DOS VISITANTES (link temporário do QR Code)
  const visitorSession = useVisitorSession({
    getCurrentState: () => ({
      direction: currentDirectionRef.current,
      speed: currentSpeedRef.current,
      emergency: currentEmergencyRef.current,
    }),
  });
  const { session, remainingMs, settings: sessionSettings, updateSettings, newSession, endSession, extendSession } = visitorSession;

  const lastValidCommandRef = useRef<MotorControlCommand | null>(null);
  const isCommandAllowedRef = useRef(visitorSession.isCommandAllowed);
  const registerVisitorCommandRef = useRef(visitorSession.registerVisitorCommand);
  const currentSessionTokenRef = useRef<string | null>(null);
  useEffect(() => {
    isCommandAllowedRef.current = visitorSession.isCommandAllowed;
    registerVisitorCommandRef.current = visitorSession.registerVisitorCommand;
    currentSessionTokenRef.current = session?.token ?? null;
  }, [visitorSession.isCommandAllowed, visitorSession.registerVisitorCommand, session]);

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

            // CONTROLE DE ACESSO: só aceita comandos do link (QR Code) atual e dentro do prazo
            if (!isCommandAllowedRef.current(cmd)) {
              if (cmd.timestamp && cmd.timestamp > lastProcessedTimestampRef.current) {
                lastProcessedTimestampRef.current = cmd.timestamp;
                // Desfaz a alteração no Firebase restaurando o último comando válido
                const token = currentSessionTokenRef.current;
                if (token) {
                  const base = lastValidCommandRef.current;
                  const restored: MotorControlCommand = {
                    power: base?.power ?? false,
                    direction: base?.direction ?? "FWD",
                    speed: base?.speed ?? 1,
                    emergency: base?.emergency ?? "CLEAR",
                    timestamp: Date.now(),
                    session: token,
                    source: "bridge",
                  };
                  set(ref(db, "motorControl/command"), restored).catch(console.error);
                }
              }
              return;
            }

            lastValidCommandRef.current = cmd;
            setLastCommand(cmd);

            // Verifica se este comando já foi despachado
            if (cmd.timestamp && cmd.timestamp > lastProcessedTimestampRef.current) {
              lastProcessedTimestampRef.current = cmd.timestamp;
              registerVisitorCommandRef.current(cmd); // inicia o cronômetro no 1º comando

              if (isConnected) {
                // Lógica de despacho para o Arduino
                if (cmd.emergency === "ACTIVE") {
                  const commandStr = "CMD:EMERGENCY";
                  send(commandStr);
                  setLastSentCommand(commandStr);
                  lastEmergencyStateRef.current = "ACTIVE";
                  lastSentPowerRef.current = false;
                } else {
                  // Se estava em emergência e agora foi limpo, envia reset antes
                  if (lastEmergencyStateRef.current === "ACTIVE" && cmd.emergency === "CLEAR") {
                    send("CMD:RESET_EMERGENCY");
                    lastEmergencyStateRef.current = "CLEAR";
                  }

                  // Envia Power se mudou
                  if (lastSentPowerRef.current !== cmd.power) {
                    send(`CMD:POWER:${cmd.power ? "ON" : "OFF"}`);
                    lastSentPowerRef.current = cmd.power;
                  }

                  // Envia Direção se mudou
                  if (lastSentDirRef.current !== cmd.direction) {
                    send(`CMD:DIR:${cmd.direction}`);
                    lastSentDirRef.current = cmd.direction;
                  }

                  // Envia Velocidade (com mapeamento se relés 2 e 3 estiverem trocados na bancada)
                  if (lastSentSpeedRef.current !== cmd.speed || !cmd.power) {
                    const hwSpeed = toHardwareSpeed(cmd.speed);
                    send(`CMD:SPEED:${hwSpeed}`);
                    lastSentSpeedRef.current = cmd.speed;
                  }
                  
                  setLastSentCommand(`PWR:${cmd.power ? "ON" : "OFF"} | DIR:${cmd.direction} | SPD:${cmd.speed} (HW:${toHardwareSpeed(cmd.speed)})`);
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
        // Reenvia velocidade atual mapeada para o hardware
        const hwSpeed = toHardwareSpeed(currentSpeedRef.current);
        send(`CMD:SPEED:${hwSpeed}`);
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

  // Link do QR Code: URL base + token da sessão atual do visitante
  const qrValue =
    controlUrl && session?.active
      ? `${controlUrl.replace(/\/+$/, "")}/controle?s=${session.token}`
      : "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-x-hidden font-sans select-none">
      {/* ================================================================
          CABEÇALHO FIXO — identidade SENAI + navegação + status da bancada
          (os indicadores e botões de hardware são os originais, intactos)
          ================================================================ */}
      <header className="sticky top-0 z-50 w-full bg-[#04172f]/85 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Identificação do Projeto */}
        <a href="#inicio" className="flex items-center gap-3">
          <span className="flex items-center rounded-md bg-[#e30613] px-2.5 py-1 text-sm font-black italic tracking-tight text-white shadow-lg shadow-red-900/30">
            SENAI
          </span>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-tight text-white">
              Smart<span className="text-[#3d8bfd]">Motion</span>
            </p>
            <p className="text-[11px] text-slate-400">Mundo SENAI • SENAI Timbó</p>
          </div>
        </a>

        {/* Navegação da landing page */}
        <nav className="hidden xl:flex items-center gap-1 text-sm font-semibold text-slate-300">
          <a href="#como-funciona" className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white transition">Como funciona</a>
          <a href="#experimente" className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white transition">Experimente</a>
          <a href="#eletronica" className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white transition">A Eletrônica</a>
          <a href="#quem-somos" className="px-3 py-2 rounded-lg hover:bg-white/5 hover:text-white transition">Quem somos</a>
        </nav>

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

      {/* ================================================================
          1. HERO — BOAS-VINDAS AO MUNDO SENAI
          ================================================================ */}
      <section id="inicio" className="relative hero-bg overflow-hidden">
        {/* Imagem de fundo (troque por um vídeo em loop se desejar) */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-[0.12] mix-blend-luminosity"
          style={{ backgroundImage: "url('/smartmotion_banner.jpg')" }}
        />
        <div aria-hidden className="absolute inset-0 bg-tech-grid" />

        <div className="relative max-w-7xl mx-auto px-6 py-16 sm:py-20 lg:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center min-h-[80vh]">
          <div className="animate-fade-in-up">
            <span className="senai-stripe mb-6" />
            <p className="section-eyebrow text-[#7fb2ff] mb-4">Bem-vindo ao Mundo SENAI</p>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.05]">
              Controle uma máquina de verdade{" "}
              <span className="bg-gradient-to-r from-[#7fb2ff] to-white bg-clip-text text-transparent">
                com o seu celular.
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-slate-300 leading-relaxed max-w-xl">
              Um toque na tela e um motor industrial ganha vida bem na sua frente.
              Descubra como a eletrônica transforma um simples comando digital em
              movimento real.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <a href="#experimente" className="btn-senai">
                Experimente agora
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>
              <a href="#como-funciona" className="btn-ghost">Como funciona?</a>
            </div>

            {/* Resumo visual do caminho da mensagem */}
            <div className="mt-10 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-200">
              <span className="flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-4 py-2">📱 Seu celular</span>
              <span className="flow-arrow text-[#e30613] font-black">➜</span>
              <span className="flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-4 py-2">🧠 O cérebro eletrônico</span>
              <span className="flow-arrow text-[#e30613] font-black">➜</span>
              <span className="flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-4 py-2">⚙️ A máquina</span>
            </div>
          </div>

          {/* Espaço para vídeo em loop do motor */}
          <div className="relative animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
            <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-[#3d8bfd]/20 blur-3xl" />
            <div className="relative float-slow">
              <MediaPlaceholder
                kind="video"
                tone="dark"
                label="Vídeo: o motor acelerando e desacelerando"
                hint="Vídeo do motor em funcionamento no laboratório."
                aspectClassName="aspect-[4/3]"
                className="shadow-2xl shadow-black/40"
              >
                <video
                  src="/media/motor-loop.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </MediaPlaceholder>
              <div className="absolute -bottom-5 -left-4 sm:-left-8 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e30613] text-xl">⚡</span>
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-500">Do digital ao real</p>
                  <p className="text-sm font-black text-[#062a57]">Em menos de 1 segundo</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          2. COMO FUNCIONA A MÁGICA — 3 PASSOS
          ================================================================ */}
      <section id="como-funciona" className="relative bg-[#eef2f7] text-slate-800 py-20 sm:py-28 scroll-mt-20">
        <div aria-hidden className="absolute inset-0 bg-tech-grid-light" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="senai-stripe mb-5" />
            <p className="section-eyebrow text-[#0b4f9c] justify-center mb-3">Passo a passo</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-[#062a57]">
              Como funciona a mágica?
            </h2>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed">
              Pense no seu próprio corpo: você decide, o <strong className="text-[#0b4f9c]">cérebro</strong> manda
              o recado e os <strong className="text-[#0b4f9c]">músculos</strong> se mexem. Aqui acontece a mesma coisa!
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 lg:gap-4 items-stretch">
            {/* Passo 1 */}
            <article className="step-card">
              <span className="step-number">01</span>
              <div className="step-icon bg-[#0b4f9c]/10">📱</div>
              <h3 className="text-xl font-black text-[#062a57] mb-2">Você dá a ordem</h3>
              <p className="text-slate-600 leading-relaxed">
                Escaneie o QR Code e escolha: ligar, parar, girar para o outro lado ou
                ir mais rápido. Seu celular envia esse recado pela internet.
              </p>
            </article>

            <div aria-hidden className="hidden lg:flex items-center justify-center text-3xl text-[#e30613] flow-arrow">➜</div>

            {/* Passo 2 */}
            <article className="step-card">
              <span className="step-number">02</span>
              <div className="step-icon bg-[#e30613]/10">🧠</div>
              <h3 className="text-xl font-black text-[#062a57] mb-2">O cérebro entende</h3>
              <p className="text-slate-600 leading-relaxed">
                Nossa placa eletrônica é o <strong>cérebro</strong> do sistema: recebe o
                recado, entende o que você pediu e traduz para uma língua que a máquina
                compreende.
              </p>
            </article>

            <div aria-hidden className="hidden lg:flex items-center justify-center text-3xl text-[#e30613] flow-arrow">➜</div>

            {/* Passo 3 */}
            <article className="step-card">
              <span className="step-number">03</span>
              <div className="step-icon bg-[#0b4f9c]/10">⚙️</div>
              <h3 className="text-xl font-black text-[#062a57] mb-2">Os músculos obedecem</h3>
              <p className="text-slate-600 leading-relaxed">
                A máquina é o <strong>músculo</strong>: recebe a ordem do cérebro e faz o
                motor girar exatamente na velocidade que você escolheu. Na hora!
              </p>
            </article>
          </div>

          {/* Mídias ilustrativas */}
          <div className="mt-14 grid sm:grid-cols-2 gap-6">
            <MediaPlaceholder
              kind="image"
              label="Foto: a placa eletrônica (o cérebro)"
              hint="Uma foto aproximada da placa montada pela turma no laboratório."
            >
              {/* Foto real do circuito eletrônico montado */}
              <div className="relative w-full h-full group overflow-hidden">
                <img
                  src="/media/foto_circuito.jpg"
                  alt="Circuito eletrônico e placa de controle SmartMotion montada em laboratório"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80" />
                <span className="absolute bottom-3 left-4 text-xs font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Circuito de Controle & Microcontrolador
                </span>
              </div>
            </MediaPlaceholder>
            <MediaPlaceholder
              kind="image"
              label="Foto: a máquina e o motor (os músculos)"
              hint="Bancada em funcionamento na feira."
            >
              {/* Demonstração visual com a arte oficial da bancada */}
              <div className="relative w-full h-full group overflow-hidden">
                <img
                  src="/smartmotion_banner.jpg"
                  alt="Bancada de Testes SmartMotion com Motor e Inversor"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80" />
                <span className="absolute bottom-3 left-4 text-xs font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Bancada SmartMotion em Laboratório
                </span>
              </div>
            </MediaPlaceholder>
          </div>
        </div>
      </section>

      {/* ================================================================
          3. ÁREA INTERATIVA — PAINEL DE CONTROLE
          (QR Code e painel ao vivo originais, encaixados sem alterações)
          ================================================================ */}
      <section id="experimente" className="relative bg-[#020617] py-20 sm:py-28 scroll-mt-20 overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-tech-grid opacity-60" />
        <div aria-hidden className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-[#0b4f9c]/25 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="senai-stripe mb-5" />
            <p className="section-eyebrow text-[#7fb2ff] justify-center mb-3">Área interativa</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
              Agora é a sua vez!
            </h2>
            <p className="mt-5 text-lg text-slate-300 leading-relaxed">
              Aponte a câmera do celular para o QR Code e assuma o comando.
              Ao lado, você acompanha ao vivo tudo o que a máquina está fazendo.
            </p>
          </div>

          {/* Moldura futurista do painel */}
          <div className="control-shell">
            <div className="control-shell__inner">
              <div aria-hidden className="scanline" />
              <span aria-hidden className="control-corner control-corner--tl" />
              <span aria-hidden className="control-corner control-corner--tr" />
              <span aria-hidden className="control-corner control-corner--bl" />
              <span aria-hidden className="control-corner control-corner--br" />

              <div className="control-shell__bar">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#e30613] animate-pulse" />
                  Painel de Controle SmartMotion
                </span>
                <span className="hidden sm:inline text-slate-500">Bancada interativa • Ao vivo</span>
              </div>

              {/* CONTEÚDO ORIGINAL DA BANCADA */}
              <div className="relative flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-8 px-4 py-10 sm:px-10 sm:py-12">
                {/* COLUNA ESQUERDA: QR CODE GIGANTE PARA VISITANTES */}
                <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg w-full">
                  {/* Badge Chamativa */}
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#e30613]/15 border border-[#e30613]/40 text-red-200 text-xs font-bold uppercase tracking-wider mb-4 animate-pulse">
                    <span>📱 Use o seu celular</span>
                  </div>

                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-2">
                    Escaneie e assuma o controle!
                  </h2>

                  <p className="text-sm sm:text-base text-slate-300 mb-6 max-w-md">
                    Aponte a câmera para o código abaixo. Em segundos, o seu celular vira o
                    controle remoto da máquina.
                  </p>

                  {/* MOLDURA ILUMINADA DO QR CODE */}
                  <div className="relative group p-6 rounded-3xl bg-slate-900/90 border-2 border-slate-700/80 shadow-2xl shadow-blue-500/10 hover:border-blue-500/50 transition-all duration-300">
                    {/* Glow de fundo */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500" />

                    {/* Container do QR Code com fundo branco de alto contraste para leitura rápida */}
                    <div className="relative bg-white p-5 rounded-2xl shadow-inner flex items-center justify-center">
                      {qrValue ? (
                        <QRCodeSVG
                          key={session?.token}
                          value={qrValue}
                          size={240}
                          level="H"
                          includeMargin={false}
                          className="w-48 h-48 sm:w-60 sm:h-60 animate-fade-in-up"
                        />
                      ) : (
                        <div className="w-48 h-48 sm:w-60 sm:h-60 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm font-semibold">
                          {session && !session.active ? (
                            <>
                              <span className="text-4xl">🔒</span>
                              Link encerrado
                              <span className="text-xs font-normal text-slate-400">Gere um novo link abaixo</span>
                            </>
                          ) : (
                            "Gerando QR Code..."
                          )}
                        </div>
                      )}
                    </div>

                    {/* Indicador de URL configurada */}
                    <div className="mt-4 flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span className="truncate max-w-[240px] text-blue-400 font-semibold">{qrValue || controlUrl || "Detectando..."}</span>
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

                  {/* TEMPO DO VISITANTE + CONTROLES DO OPERADOR */}
                  <div className="mt-6 w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/80 p-4 text-left">
                    {/* Contagem regressiva */}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tempo do visitante</p>
                        <p
                          className={`text-2xl font-black tabular-nums ${
                            remainingMs !== null && remainingMs <= 30_000 ? "text-red-400 animate-pulse" : "text-white"
                          }`}
                        >
                          {!session
                            ? "—"
                            : !session.active
                            ? "Encerrado"
                            : remainingMs !== null
                            ? formatDuration(remainingMs)
                            : formatDuration(session.durationMs)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {!session
                            ? "Preparando link..."
                            : !session.active
                            ? "Nenhum celular consegue controlar agora."
                            : remainingMs !== null
                            ? "Visitante no controle"
                            : "Aguardando o visitante escanear"}
                        </p>
                      </div>
                      {session?.active && remainingMs !== null && (
                        <button
                          onClick={() => extendSession(60_000)}
                          className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
                          title="Dar mais 1 minuto ao visitante atual"
                        >
                          +1 min
                        </button>
                      )}
                    </div>

                    {/* Barra de progresso */}
                    {session?.active && remainingMs !== null && (
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#e30613] to-[#3d8bfd] transition-all duration-1000"
                          style={{ width: `${Math.min(100, (remainingMs / session.durationMs) * 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Ações */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => newSession()}
                        className="rounded-lg bg-[#e30613] px-3 py-2 text-xs font-black text-white hover:bg-[#c70511] transition active:scale-95"
                      >
                        🔄 Novo link agora
                      </button>
                      <button
                        onClick={() => endSession()}
                        disabled={!session?.active}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        🔒 Encerrar acesso
                      </button>
                    </div>

                    {/* Configurações */}
                    <div className="mt-4 space-y-2.5 border-t border-slate-800 pt-3 text-xs text-slate-300">
                      <label className="flex items-center justify-between gap-2">
                        <span>Duração de cada visitante</span>
                        <select
                          value={sessionSettings.durationMin}
                          onChange={(e) => updateSettings({ durationMin: Number(e.target.value) })}
                          className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
                        >
                          {SESSION_DURATION_OPTIONS.map((min) => (
                            <option key={min} value={min}>
                              {min} min
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span>Gerar novo link sozinho quando o tempo acabar</span>
                        <input
                          type="checkbox"
                          checked={sessionSettings.autoRenew}
                          onChange={(e) => updateSettings({ autoRenew: e.target.checked })}
                          className="h-4 w-4 accent-[#e30613]"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span>Desligar o motor ao trocar de visitante</span>
                        <input
                          type="checkbox"
                          checked={sessionSettings.stopOnReset}
                          onChange={(e) => updateSettings({ stopOnReset: e.target.checked })}
                          className="h-4 w-4 accent-[#e30613]"
                        />
                      </label>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        O tempo começa no primeiro comando do visitante. A parada de emergência
                        funciona sempre, mesmo com link expirado.
                      </p>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA: A MÁQUINA AO VIVO (linguagem simples para o público) */}
                <div className="flex-1 flex flex-col gap-4 max-w-lg w-full">
                  {/* CARD PRINCIPAL: COMO A MÁQUINA ESTÁ AGORA */}
                  <div
                    className={`relative overflow-hidden rounded-3xl border p-6 shadow-xl transition-all duration-500 ${
                      isEmergencyActive
                        ? "bg-red-950/60 border-red-500/60 shadow-red-900/40"
                        : isPowerOn
                        ? "bg-emerald-950/40 border-emerald-500/40 shadow-emerald-900/30"
                        : "bg-slate-900/90 border-slate-800"
                    }`}
                  >
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">A máquina agora</p>

                    <div className="mt-3 flex items-center gap-4">
                      <div
                        className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl text-4xl shadow-lg ${
                          isEmergencyActive
                            ? "bg-red-600 animate-pulse"
                            : isPowerOn
                            ? `bg-gradient-to-br ${activeSpeedConfig.color}`
                            : "bg-slate-800"
                        }`}
                      >
                        <span className={isPowerOn && !isEmergencyActive ? "inline-block animate-spin [animation-duration:2.5s]" : ""}>
                          {isEmergencyActive ? "🛑" : isPowerOn ? "⚙️" : "😴"}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-3xl font-black text-white leading-tight">
                          {isEmergencyActive ? "Parada de segurança" : isPowerOn ? "Trabalhando!" : "Descansando"}
                        </h3>
                        <p className="mt-1 text-sm text-slate-300">
                          {isEmergencyActive
                            ? "Alguém apertou o botão de emergência. Tudo parado por segurança."
                            : isPowerOn
                            ? "O motor está girando e obedecendo ao seu comando."
                            : "Esperando alguém escanear o código e dar a primeira ordem."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CARD: VELOCIDADE E SENTIDO */}
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Velocidade escolhida</p>
                      <p className="text-sm font-black text-white">
                        {activeSpeedConfig.icon} {activeSpeedConfig.label}
                      </p>
                    </div>

                    {/* Medidor de velocidade em barras */}
                    <div className="mt-4 grid grid-cols-4 gap-2 items-end h-16">
                      {SPEED_CONFIG.map((s, idx) => {
                        const lit = isPowerOn && !isEmergencyActive && s.level <= activeSpeedConfig.level;
                        return (
                          <div key={s.level} className="flex flex-col items-center gap-1.5">
                            <div
                              className={`w-full rounded-lg transition-all duration-500 ${
                                lit ? `bg-gradient-to-t ${s.color} shadow-lg ${s.glowColor}` : "bg-slate-800"
                              }`}
                              style={{ height: `${(idx + 1) * 25}%`, minHeight: "0.75rem" }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px] font-semibold text-slate-400">
                      {SPEED_CONFIG.map((s) => (
                        <span key={s.level} className={s.level === activeSpeedConfig.level ? "text-white" : ""}>
                          {s.icon} {s.label}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-800/60 px-4 py-3">
                      <span
                        className={`text-2xl inline-block transition-transform duration-500 ${
                          currentDirection === "FWD" ? "" : "-scale-x-100"
                        }`}
                      >
                        🔃
                      </span>
                      <p className="text-sm text-slate-300">
                        Girando para a{" "}
                        <strong className="text-white">
                          {currentDirection === "FWD" ? "direita (como o relógio)" : "esquerda (contra o relógio)"}
                        </strong>
                      </p>
                    </div>
                  </div>

                  {/* CARD: O CAMINHO DA MENSAGEM (celular → cérebro → máquina) */}
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">O caminho da sua ordem</p>
                    <div className="flex items-stretch justify-between gap-2">
                      {[
                        { icon: "📱", title: "Celular", desc: firebaseConnected ? "Pedidos chegando" : "Aguardando", on: firebaseConnected },
                        { icon: "🧠", title: "Cérebro", desc: isConnected ? "Placa conectada" : "Placa desligada", on: isConnected },
                        { icon: "⚙️", title: "Máquina", desc: isPowerOn && !isEmergencyActive ? "Em movimento" : "Parada", on: isPowerOn && !isEmergencyActive },
                      ].map((node, i) => (
                        <div key={node.title} className="flex flex-1 items-center gap-2">
                          <div
                            className={`flex flex-1 flex-col items-center rounded-2xl border px-2 py-3 text-center transition-all duration-500 ${
                              node.on
                                ? "border-[#3d8bfd]/60 bg-[#0b4f9c]/25 shadow-lg shadow-blue-500/20"
                                : "border-slate-700/80 bg-slate-800/40 opacity-60"
                            }`}
                          >
                            <span className="text-2xl">{node.icon}</span>
                            <span className="mt-1 text-xs font-black text-white">{node.title}</span>
                            <span className="text-[10px] text-slate-400">{node.desc}</span>
                          </div>
                          {i < 2 && <span className="flow-arrow text-[#e30613] font-black">➜</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DETALHES TÉCNICOS — recolhido por padrão, para uso da equipe */}
                  <details className="group rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-xs">
                    <summary className="cursor-pointer list-none flex items-center justify-between font-semibold text-slate-500 hover:text-slate-300">
                      <span>🔧 Detalhes técnicos (equipe)</span>
                      <span className="transition-transform group-open:rotate-180">▾</span>
                    </summary>

                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {[
                        { name: "R1", on: arduinoStatus?.r1 ?? false },
                        { name: "R2", on: arduinoStatus?.r2 ?? false },
                        { name: "R3", on: arduinoStatus?.r3 ?? false },
                        { name: "R4", on: arduinoStatus?.r4 ?? false },
                      ].map((relay) => (
                        <div
                          key={relay.name}
                          className={`flex flex-col items-center rounded-lg border py-2 ${
                            relay.on ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-800/50 text-slate-500"
                          }`}
                        >
                          <span className="font-black">{relay.name}</span>
                          <span className="text-[10px]">{relay.on ? "ON" : "OFF"}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-col gap-1.5 font-mono text-[11px]">
                      <p className="text-slate-500">
                        Último envio: <span className="text-blue-400">{lastSentCommand || "—"}</span>
                      </p>
                      <p className="truncate text-slate-500">
                        Retorno: <span className="text-slate-300">{arduinoStatus?.raw || "—"}</span>
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>

          {/* Mini-guia para o visitante */}
          <ol className="mt-10 grid sm:grid-cols-3 gap-4 text-sm">
            <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e30613] font-black text-white">1</span>
              <span className="text-slate-200">Abra a <strong className="text-white">câmera</strong> do seu celular</span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e30613] font-black text-white">2</span>
              <span className="text-slate-200">Aponte para o <strong className="text-white">QR Code</strong> e toque no link</span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e30613] font-black text-white">3</span>
              <span className="text-slate-200">Pronto! <strong className="text-white">Comande a máquina</strong> e veja ela obedecer</span>
            </li>
          </ol>

          {/* Console técnico (oculto por padrão, aberto pelo botão do cabeçalho) */}
          {showConsole && (
            <div className="mt-8 overflow-hidden rounded-2xl border border-slate-800">
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
            </div>
          )}
        </div>
      </section>

      {/* ================================================================
          4. A IMPORTÂNCIA DA ELETRÔNICA DE MANUTENÇÃO
          ================================================================ */}
      <section id="eletronica" className="relative class-badge text-white py-20 sm:py-28 scroll-mt-20 overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-tech-grid" />
        <div aria-hidden className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-[#e30613]/25 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6">
          <div className="max-w-4xl">
            <p className="section-eyebrow text-white/70 mb-6">
              <span className="senai-stripe" /> A ponte entre dois mundos
            </p>
            <blockquote className="text-3xl sm:text-5xl font-black leading-tight tracking-tight">
              “Sem a eletrônica, os comandos digitais{" "}
              <span className="text-[#ffb3b8]">nunca ganhariam vida</span> no mundo real.”
            </blockquote>
            <p className="mt-8 text-lg sm:text-xl text-blue-100/90 leading-relaxed max-w-3xl">
              O celular só fala a língua do mundo digital. O motor só entende força e
              movimento. A <strong className="text-white">Eletrônica de Manutenção</strong> é
              quem une esses dois mundos — e mantém tudo funcionando nas fábricas, nos
              hospitais, nos carros e até dentro da sua casa.
            </p>
          </div>

          <div className="mt-14 grid sm:grid-cols-3 gap-5">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-7 backdrop-blur-sm">
              <div className="text-4xl mb-4">🔌</div>
              <h3 className="text-xl font-black mb-2">Conecta</h3>
              <p className="text-blue-100/85 leading-relaxed">Liga o mundo digital ao mundo físico, como uma ponte.</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-7 backdrop-blur-sm">
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-xl font-black mb-2">Protege</h3>
              <p className="text-blue-100/85 leading-relaxed">Garante que tudo funcione com segurança, com parada de emergência sempre à mão.</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-7 backdrop-blur-sm">
              <div className="text-4xl mb-4">🔧</div>
              <h3 className="text-xl font-black mb-2">Mantém</h3>
              <p className="text-blue-100/85 leading-relaxed">Encontra e resolve problemas para que as máquinas nunca parem.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          5. QUEM SOMOS — A TURMA
          ================================================================ */}
      <section id="quem-somos" className="relative bg-white text-slate-800 py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <span className="senai-stripe mx-auto mb-5" />
            <p className="section-eyebrow text-[#0b4f9c] justify-center mb-3">Quem somos</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-[#062a57]">
              Os autores dessa mágica
            </h2>

            <div className="mt-6 inline-block rounded-2xl class-badge px-6 py-4 text-white shadow-xl shadow-blue-900/20 text-left sm:text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">Turma</p>
              <p className="text-lg sm:text-xl font-black leading-snug">
                Aprendizagem Industrial de Eletrônico de Manutenção Industrial
              </p>
            </div>

            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              Somos estudantes do SENAI que transformaram curiosidade em tecnologia.
              Este projeto foi pensado, montado e testado por nós, unindo o que
              aprendemos em sala de aula com a prática do laboratório.
            </p>

            <ul className="mt-8 grid grid-cols-3 gap-3 text-center">
              <li className="rounded-2xl bg-[#eef2f7] px-3 py-5">
                <div className="text-2xl mb-1">💡</div>
                <p className="text-sm font-bold text-[#062a57]">Pensado</p>
              </li>
              <li className="rounded-2xl bg-[#eef2f7] px-3 py-5">
                <div className="text-2xl mb-1">🛠️</div>
                <p className="text-sm font-bold text-[#062a57]">Montado</p>
              </li>
              <li className="rounded-2xl bg-[#eef2f7] px-3 py-5">
                <div className="text-2xl mb-1">✅</div>
                <p className="text-sm font-bold text-[#062a57]">Testado</p>
              </li>
            </ul>

            <div className="mt-8 rounded-2xl bg-slate-50 border-l-4 border-[#e30613] p-5 text-left text-slate-600 shadow-sm">
              <p>
                <strong className="text-[#062a57]">Gostou?</strong> Você também pode estudar aqui!
                Converse com a nossa equipe sobre os cursos do SENAI.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          RODAPÉ — ORGULHO DA TURMA
          ================================================================ */}
      <footer className="relative w-full bg-[#04172f] text-slate-300">
        <div aria-hidden className="h-1.5 w-full bg-gradient-to-r from-[#e30613] via-[#e30613] to-[#0b4f9c]" />
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-[1.5fr_1fr] gap-8 items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">Feito com orgulho por</p>
            <p className="mt-2 text-2xl sm:text-3xl font-black text-white leading-tight">
              Turma de Aprendizagem Industrial de{" "}
              <span className="text-[#7fb2ff]">Eletrônico de Manutenção Industrial</span>
            </p>
            <p className="mt-3 text-sm text-slate-400">Desenvolvido para apresentação no Mundo SENAI • SENAI Timbó</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-4 text-sm">
            <span className="flex items-center rounded-md bg-[#e30613] px-3 py-1.5 text-lg font-black italic tracking-tight text-white">
              SENAI
            </span>
            <Link href="/controle" className="text-blue-400 hover:underline">
              Abrir Controle Mobile (Visitante) →
            </Link>
          </div>
        </div>
      </footer>

      {/* BOTÃO FLUTUANTE DE ACESSO RÁPIDO AO QR CODE (Ideal durante a feira para o apresentador) */}
      <a
        href="#experimente"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#e30613] hover:bg-[#c70511] text-white text-xs font-black uppercase tracking-wider shadow-2xl shadow-red-600/50 hover:scale-105 active:scale-95 transition-all border border-white/20 backdrop-blur-md"
        title="Rolar direto para o QR Code"
      >
        <span className="text-sm">📱</span>
        <span>QR Code ao Vivo</span>
      </a>
    </div>
  );
}
