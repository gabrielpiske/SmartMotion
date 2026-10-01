"use client";

interface ConnectionStatusProps {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium
        transition-all duration-300
        ${
          isConnected
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : "bg-red-500/10 text-red-400 border border-red-500/20"
        }
      `}
    >
      <span
        className={`
          w-2 h-2 rounded-full
          ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-500"}
        `}
      />
      {isConnected ? "Firebase conectado" : "Sem conexão"}
    </div>
  );
}
