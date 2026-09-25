'use client';
export default function CtaWidget({ props }: { props: Record<string, any>; data?: any }) {
  return (
    <div className="rounded-xl bg-gradient-to-r from-[#F58220] to-orange-600 p-8 text-center text-white">
      {props.title && <h2 className="mb-2 text-xl font-bold">{props.title}</h2>}
      {props.description && <p className="mb-4 text-sm opacity-90">{props.description}</p>}
      {props.buttonText && <a href={String(props.buttonLink || '#')} className="inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-bold text-[#F58220]">{props.buttonText}</a>}
    </div>
  );
}
