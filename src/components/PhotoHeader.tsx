import type { ReactNode } from 'react';

interface PhotoHeaderProps {
  image: string;
  /** Video corto opcional (mp4 sin audio). Se muestra encima de la foto, que queda de portada. */
  video?: string;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}

/** Encabezado de pantalla con foto de fondo (fotos de Flow en /img). */
export default function PhotoHeader({ image, video, title, subtitle, children }: PhotoHeaderProps) {
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <header className="relative -mx-4 -mt-5 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-3xl">
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
      {video && !reduceMotion && (
        <video
          src={video}
          poster={image}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#172123] via-[#172123]/70 to-[#172123]/10" />
      <div className="relative flex min-h-[176px] flex-col justify-end gap-2 px-5 pb-5 pt-16 sm:min-h-[200px] sm:px-8">
        <h1 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <div className="text-sm text-white/80">{subtitle}</div>}
        {children}
      </div>
    </header>
  );
}
