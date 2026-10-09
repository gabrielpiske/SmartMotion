"use client";

import type { DirectionState } from "@/lib/types";

interface PowerDirectionControlProps {
  power: boolean;
  direction: DirectionState;
  emergency: "ACTIVE" | "CLEAR";
  isSending: boolean;
  onPowerToggle: () => void;
  onDirectionToggle: () => void;
}

export default function PowerDirectionControl({
  power,
  direction,
  emergency,
  isSending,
  onPowerToggle,
  onDirectionToggle,
}: PowerDirectionControlProps) {
  const isDisabled = emergency === "ACTIVE" || isSending;

  return (
    <div className="w-full max-w-md mx-auto mb-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-3 text-center">
        Controle Principal
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {/* Power Button */}
        <button
          onClick={onPowerToggle}
          disabled={isDisabled}
          className={`
            relative flex flex-col items-center justify-center
            rounded-2xl border-2 p-4 min-h-[100px]
            transition-all duration-300 ease-out
            ${
              power
                ? `bg-gradient-to-br from-emerald-600 to-emerald-700 border-emerald-400 shadow-lg shadow-emerald-500/40`
                : `bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600 shadow-md`
            }
            ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}
          `}
        >
          <span className="text-2xl mb-1">⚡</span>
          <span className="text-sm font-bold text-white">
            {power ? "LIGADO" : "DESLIGADO"}
          </span>
          <span className="text-[10px] text-white/60">Energia (Relé 1)</span>
        </button>

        {/* Direction Button */}
        <button
          onClick={onDirectionToggle}
          disabled={isDisabled || !power}
          className={`
            relative flex flex-col items-center justify-center
            rounded-2xl border-2 p-4 min-h-[100px]
            transition-all duration-300 ease-out
            ${
              direction === "FWD"
                ? `bg-gradient-to-br from-blue-600 to-blue-700 border-blue-400 shadow-lg shadow-blue-500/40`
                : `bg-gradient-to-br from-purple-600 to-purple-700 border-purple-400 shadow-lg shadow-purple-500/40`
            }
            ${isDisabled || !power ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}
          `}
        >
          <span className="text-2xl mb-1">
            {direction === "FWD" ? "➡️" : "⬅️"}
          </span>
          <span className="text-sm font-bold text-white">
            {direction === "FWD" ? "HORÁRIO" : "ANTI-HORÁRIO"}
          </span>
          <span className="text-[10px] text-white/60">Giro (Relé 2)</span>
        </button>
      </div>
    </div>
  );
}
