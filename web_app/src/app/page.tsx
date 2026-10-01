"use client";

import { useMotorControl } from "@/hooks/useMotorControl";
import SpeedControl from "@/components/SpeedControl";
import EmergencyButton from "@/components/EmergencyButton";
import RelayDashboard from "@/components/RelayDashboard";
import ConnectionStatus from "@/components/ConnectionStatus";

export default function Home() {
  const {
    currentSpeed,
    emergency,
    isConnected,
    isSending,
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
            Smart<span className="text-blue-400">Drive</span>
          </h1>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Controle Multispeed — Mundo Senai
        </p>

        <ConnectionStatus isConnected={isConnected} />
      </header>

      {/* Conteúdo principal */}
      <div className="w-full flex flex-col gap-6 flex-1 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
        {/* Botões de Velocidade */}
        <SpeedControl
          currentSpeed={currentSpeed}
          emergency={emergency}
          isSending={isSending}
          onSpeedChange={setSpeed}
        />

        {/* Dashboard dos Relés */}
        <RelayDashboard
          currentSpeed={currentSpeed}
          emergency={emergency}
        />

        {/* Botão de Emergência */}
        <EmergencyButton
          emergency={emergency}
          isSending={isSending}
          onEmergency={activateEmergency}
          onReset={resetEmergency}
        />
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
        <p className="text-[10px] text-slate-600">
          SENAI Timbó — Aprendizagem Industrial em Eletrônica
        </p>
      </footer>
    </main>
  );
}
