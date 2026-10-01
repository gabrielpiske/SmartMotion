"use client";

import { useState } from "react";

interface EmergencyButtonProps {
  emergency: "ACTIVE" | "CLEAR";
  isSending: boolean;
  onEmergency: () => void;
  onReset: () => void;
}

export default function EmergencyButton({
  emergency,
  isSending,
  onEmergency,
  onReset,
}: EmergencyButtonProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const isEmergencyActive = emergency === "ACTIVE";

  const handleEmergencyClick = () => {
    if (!isEmergencyActive) {
      onEmergency();
    }
  };

  const handleResetClick = () => {
    if (!confirmReset) {
      // Primeiro clique: pedir confirmação
      setConfirmReset(true);
      // Auto-cancelar confirmação depois de 3 segundos
      setTimeout(() => setConfirmReset(false), 3000);
    } else {
      // Segundo clique: confirmar reset
      onReset();
      setConfirmReset(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-3">
      {/* Botão de EMERGÊNCIA */}
      <button
        onClick={handleEmergencyClick}
        disabled={isEmergencyActive || isSending}
        className={`
          relative w-full py-5 rounded-2xl font-black text-xl uppercase tracking-wider
          border-2 transition-all duration-200
          ${
            isEmergencyActive
              ? "bg-red-900/80 border-red-500 text-red-200 cursor-not-allowed"
              : "bg-gradient-to-b from-red-600 to-red-700 border-red-400 text-white hover:from-red-500 hover:to-red-600 active:scale-95 shadow-lg shadow-red-600/40 cursor-pointer"
          }
        `}
      >
        {/* Glow pulsante quando emergência ativa */}
        {isEmergencyActive && (
          <div className="absolute inset-0 rounded-2xl animate-pulse bg-red-500/20 pointer-events-none" />
        )}

        <div className="flex items-center justify-center gap-3">
          <svg
            className={`w-7 h-7 ${isEmergencyActive ? "animate-pulse" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>

          {isEmergencyActive ? "⚠ EMERGÊNCIA ATIVA" : "EMERGÊNCIA"}
        </div>
      </button>

      {/* Botão de RESET (só aparece quando emergência está ativa) */}
      {isEmergencyActive && (
        <button
          onClick={handleResetClick}
          disabled={isSending}
          className={`
            w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wider
            border-2 transition-all duration-200
            ${
              confirmReset
                ? "bg-amber-600 border-amber-400 text-white animate-pulse cursor-pointer"
                : "bg-slate-700 border-slate-500 text-slate-200 hover:bg-slate-600 cursor-pointer"
            }
            ${isSending ? "opacity-50 cursor-not-allowed" : "active:scale-95"}
          `}
        >
          {confirmReset
            ? "⚠ CONFIRMAR RESET – Clique novamente"
            : "🔄 Resetar Emergência"}
        </button>
      )}
    </div>
  );
}
