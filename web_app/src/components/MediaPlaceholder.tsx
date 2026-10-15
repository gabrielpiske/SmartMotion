import type { ReactNode } from "react";

/**
 * MediaPlaceholder — moldura estilizada para fotos e vídeos da feira.
 *
 * Enquanto não houver mídia, exibe um "espaço reservado" elegante.
 * Para inserir a mídia real, basta passar o elemento como filho:
 *
 *   <MediaPlaceholder kind="video" label="Motor em ação">
 *     <video src="/media/motor-loop.mp4" autoPlay muted loop playsInline
 *            className="absolute inset-0 h-full w-full object-cover" />
 *   </MediaPlaceholder>
 *
 *   <MediaPlaceholder kind="group" label="Foto da turma">
 *     <img src="/media/turma.jpg" alt="Turma de Eletrônico de Manutenção Industrial"
 *          className="absolute inset-0 h-full w-full object-cover" />
 *   </MediaPlaceholder>
 */

type MediaKind = "video" | "image" | "group";

interface MediaPlaceholderProps {
  kind?: MediaKind;
  label: string;
  hint?: string;
  /** Classe Tailwind de proporção (ex.: "aspect-video", "aspect-[4/3]") */
  aspectClassName?: string;
  tone?: "light" | "dark";
  className?: string;
  children?: ReactNode;
}

const ICONS: Record<MediaKind, ReactNode> = {
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.16-5.16a2.25 2.25 0 013.18 0l5.16 5.16m-1.5-1.5l1.41-1.41a2.25 2.25 0 013.18 0l2.91 2.91M3.75 21h16.5A1.5 1.5 0 0021.75 19.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21zM15 8.25h.008v.008H15V8.25z" />
    </svg>
  ),
  group: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.09 9.09 0 003.74-.48 3 3 0 00-4.68-2.72m.94 3.2v.03c0 .22-.01.45-.04.67A11.94 11.94 0 0112 21c-2.17 0-4.21-.58-5.96-1.58-.03-.22-.04-.45-.04-.68m12 0a5.97 5.97 0 00-.94-3.2m0 0A6 6 0 0012 12.75a6 6 0 00-5.06 2.77m0 0a3 3 0 00-4.68 2.72 8.99 8.99 0 003.74.48m.94-3.2a5.97 5.97 0 00-.94 3.2M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
};

export default function MediaPlaceholder({
  kind = "image",
  label,
  hint,
  aspectClassName = "aspect-video",
  tone = "light",
  className = "",
  children,
}: MediaPlaceholderProps) {
  return (
    <figure className={`media-frame media-frame--${tone} ${aspectClassName} ${className}`}>
      {children ? (
        children
      ) : (
        <div className="media-placeholder">
          <div className="media-placeholder__icon">{ICONS[kind]}</div>
          <figcaption className="flex flex-col items-center gap-1">
            <span className="text-sm font-bold">{label}</span>
            {hint && <span className="max-w-xs text-xs leading-relaxed opacity-70">{hint}</span>}
          </figcaption>
          <span className="media-placeholder__tag">
            Espaço para {kind === "video" ? "vídeo" : "foto"}
          </span>
        </div>
      )}
    </figure>
  );
}
