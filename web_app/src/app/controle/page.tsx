"use client";

import { useMotorControl } from "@/hooks/useMotorControl";
import SpeedControl from "@/components/SpeedControl";
import PowerDirectionControl from "@/components/PowerDirectionControl";
import EmergencyButton from "@/components/EmergencyButton";
import RelayDashboard from "@/components/RelayDashboard";
import ConnectionStatus from "@/components/ConnectionStatus";
import Link from "next/link";

function formatTime(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ControleVisitantePage() {
  const {
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
  } = useMotorControl();

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-6 pb-10">
      {/* Header */}
      <header className="w-full max-w-md mx-auto text-center mb-6 animate-fade-in-up">
        {/* Logo / Title */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <svg
            className="w-7 h-7 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
            />
          </svg>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Smart<span className="text-blue-400">Motion</span>
          </h1>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Controle do Visitante — Mundo SENAI
        </p>

        <ConnectionStatus isConnected={isConnected} />

        {/* Tempo de acesso do visitante */}
        {sessionStatus === "active" && remainingMs !== null && (
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold ${
              remainingMs <= 30_000
                ? "border-red-500/40 bg-red-500/10 text-red-300 animate-pulse"
                : "border-blue-500/30 bg-blue-500/10 text-blue-200"
            }`}
          >
            ⏱ Seu tempo: {formatTime(remainingMs)}
          </div>
        )}
        {sessionStatus === "waiting" && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-200">
            ✅ Acesso liberado! Seu tempo começa no primeiro comando.
          </div>
        )}
      </header>

      {/* Conteúdo principal */}
      <div className="w-full flex flex-col gap-6 flex-1 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
        {sessionStatus === "checking" && (
          <div className="w-full max-w-md mx-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center text-sm text-slate-400">
            Verificando seu acesso...
          </div>
        )}

        {(sessionStatus === "expired" || sessionStatus === "missing") && (
          <div className="w-full max-w-md mx-auto rounded-3xl border border-slate-700 bg-slate-900/90 p-8 text-center shadow-2xl">
            <div className="text-5xl mb-4">{sessionStatus === "expired" ? "👋" : "📷"}</div>
            <h2 className="text-2xl font-black text-white">
              {sessionStatus === "expired" ? "Seu tempo terminou!" : "Escaneie o QR Code"}
            </h2>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              {sessionStatus === "expired"
                ? "Obrigado por controlar a nossa máquina! Agora é a vez do próximo visitante. Para testar de novo, escaneie o novo QR Code na tela da bancada."
                : "Para controlar a máquina, aponte a câmera do celular para o QR Code exibido na tela da bancada."}
            </p>
            <p className="mt-6 text-[11px] text-slate-600">
              Turma de Eletrônico de Manutenção Industrial — SENAI
            </p>
          </div>
        )}

        {canControl && (
          <>
            {/* Botão de Ligar/Desligar e Sentido de Giro */}
            <PowerDirectionControl
              power={power}
              direction={direction}
              emergency={emergency}
              isSending={isSending}
              onPowerToggle={togglePower}
              onDirectionToggle={toggleDirection}
            />

            {/* Botões de Velocidade */}
            <SpeedControl
              currentSpeed={currentSpeed}
              emergency={emergency}
              isSending={isSending}
              onSpeedChange={setSpeed}
            />

            {/* Dashboard dos Relés */}
            <RelayDashboard
              power={power}
              direction={direction}
              currentSpeed={currentSpeed}
              emergency={emergency}
            />
          </>
        )}

        {/* Botão de Emergência — sempre disponível por segurança */}
        {sessionStatus !== "checking" && (
          <EmergencyButton
            emergency={emergency}
            isSending={isSending}
            onEmergency={activateEmergency}
            onReset={resetEmergency}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center animate-fade-in-up flex flex-col items-center gap-2" style={{ animationDelay: "0.2s" }}>
        <p className="text-[10px] text-slate-600">
          SENAI Timbó — Aprendizagem Industrial em Eletrônica
        </p>
        <Link
          href="/"
          className="text-[11px] text-slate-500 hover:text-blue-400 transition-colors py-1 px-2.5 rounded bg-slate-900/60 border border-slate-800"
        >
          🖥 Ver Página Principal da Bancada
        </Link>
      </footer>
    </main>
  );
}
