"use client";

import { SPEED_RELAY_MAP } from "@/lib/types";
import type { SpeedLevel } from "@/lib/types";

interface RelayDashboardProps {
  currentSpeed: SpeedLevel;
  emergency: "ACTIVE" | "CLEAR";
}

const RELAY_LABELS = ["R1", "R2", "R3", "R4"];
const RELAY_FUNCTIONS = ["Velocidade 1", "Velocidade 2", "Velocidade 3", "Reservado"];

export default function RelayDashboard({
  currentSpeed,
  emergency,
}: RelayDashboardProps) {
  const isEmergency = emergency === "ACTIVE";
  // Na emergência, todos os relés desligam
  const relayStates = isEmergency
    ? [false, false, false, false]
    : SPEED_RELAY_MAP[currentSpeed];

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-3 text-center">
        Estado dos Relés
      </h2>

      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-4">
        {/* Diagrama dos Relés */}
        <div className="grid grid-cols-4 gap-2">
          {relayStates.map((isOn, index) => (
            <div
              key={index}
              className="flex flex-col items-center"
            >
              {/* Corpo do relé */}
              <div
                className={`
                  relative w-full aspect-square rounded-xl border-2
                  flex flex-col items-center justify-center
                  transition-all duration-500 ease-out
                  ${
                    isOn
                      ? "bg-emerald-500/20 border-emerald-400 shadow-lg shadow-emerald-500/30"
                      : "bg-slate-700/40 border-slate-600"
                  }
                  ${isEmergency ? "border-red-500/50" : ""}
                `}
              >
                {/* LED indicador */}
                <div
                  className={`
                    w-4 h-4 rounded-full mb-1
                    transition-all duration-300
                    ${
                      isOn
                        ? "bg-emerald-400 shadow-lg shadow-emerald-400/60"
                        : "bg-slate-600"
                    }
                    ${isEmergency && !isOn ? "bg-red-900/60" : ""}
                  `}
                />

                {/* Nome do relé */}
                <span
                  className={`
                    text-xs font-bold
                    ${isOn ? "text-emerald-300" : "text-slate-500"}
                  `}
                >
                  {RELAY_LABELS[index]}
                </span>

                {/* Estado ON/OFF */}
                <span
                  className={`
                    text-[10px] font-mono mt-0.5
                    ${isOn ? "text-emerald-400" : "text-slate-600"}
                  `}
                >
                  {isOn ? "ON" : "OFF"}
                </span>
              </div>

              {/* Função do relé */}
              <span className="text-[10px] text-slate-500 mt-1 text-center leading-tight">
                {RELAY_FUNCTIONS[index]}
              </span>
            </div>
          ))}
        </div>

        {/* Linha de conexão visual simulando o circuito */}
        <div className="mt-3 flex items-center gap-1">
          <div className="h-px flex-1 bg-slate-600" />
          <span className="text-[10px] text-slate-500 px-2 whitespace-nowrap">
            → Entradas DI do Inversor
          </span>
          <div className="h-px flex-1 bg-slate-600" />
        </div>

        {/* Indicador de velocidade resultante */}
        <div className="mt-3 text-center">
          <div
            className={`
              inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider
              transition-all duration-300
              ${
                isEmergency
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : currentSpeed > 0
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-700/50 text-slate-400 border border-slate-600/30"
              }
            `}
          >
            <span
              className={`
                w-2 h-2 rounded-full
                ${
                  isEmergency
                    ? "bg-red-500 animate-pulse"
                    : currentSpeed > 0
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-slate-500"
                }
              `}
            />
            {isEmergency
              ? "Emergência — Motor bloqueado"
              : currentSpeed > 0
                ? `Motor ativo — Velocidade ${currentSpeed}`
                : "Motor parado"}
          </div>
        </div>
      </div>
    </div>
  );
}
