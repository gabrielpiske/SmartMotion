"use client";

import { SPEED_CONFIG } from "@/lib/types";
import type { SpeedLevel } from "@/lib/types";

interface SpeedControlProps {
  currentSpeed: SpeedLevel;
  emergency: "ACTIVE" | "CLEAR";
  isSending: boolean;
  onSpeedChange: (speed: SpeedLevel) => void;
}

export default function SpeedControl({
  currentSpeed,
  emergency,
  isSending,
  onSpeedChange,
}: SpeedControlProps) {
  const isDisabled = emergency === "ACTIVE" || isSending;

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-3 text-center">
        Controle de Velocidade
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {SPEED_CONFIG.map((config) => {
          const isActive = currentSpeed === config.level;

          return (
            <button
              key={config.level}
              onClick={() => onSpeedChange(config.level)}
              disabled={isDisabled}
              className={`
                relative group flex flex-col items-center justify-center
                rounded-2xl border-2 p-5 min-h-[120px]
                transition-all duration-300 ease-out
                ${
                  isActive
                    ? `bg-gradient-to-br ${config.activeColor} ${config.borderColor} ${config.glowColor} shadow-lg scale-[1.02]`
                    : `bg-gradient-to-br ${config.color} border-white/10 shadow-md hover:scale-[1.02] hover:shadow-lg`
                }
                ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}
              `}
            >
              {/* Indicador de ativo */}
              {isActive && (
                <div className="absolute top-2 right-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                  </span>
                </div>
              )}

              {/* Ícone */}
              <span className="text-3xl mb-1" role="img" aria-label={config.label}>
                {config.icon}
              </span>

              {/* Label */}
              <span className={`text-lg font-bold ${config.textColor}`}>
                {config.label}
              </span>

              {/* Sublabel com RPM */}
              <span className="text-xs text-white/60 mt-0.5">
                {config.rpm > 0 ? `~${config.rpm} RPM` : config.sublabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
