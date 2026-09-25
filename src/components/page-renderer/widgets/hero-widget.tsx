'use client';
export default function HeroWidget({ props }: { props: Record<string, any>; data?: any }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 p-8 md:p-12">
      {props.backgroundImage && (
        <img src={String(props.backgroundImage)} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
      )}
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {props.badge && <span className="mb-2 inline-block rounded-full bg-[#F58220]/20 px-3 py-1 text-xs font-medium text-[#F58220]">{props.badge}</span>}
        {props.title && <h1 className="mb-2 text-2xl font-bold text-white md:text-4xl">{props.title}</h1>}
        {props.subtitle && <p className="mb-4 text-sm text-zinc-300 md:text-base">{props.subtitle}</p>}
        {props.buttonText && (
          <a href={String(props.buttonLink || '#')} className="inline-block rounded-lg bg-[#F58220] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#F58220]/90">
            {props.buttonText}
          </a>
        )}
      </div>
    </div>
  );
}
