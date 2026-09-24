'use client';
export default function ImageWidget({ props }: { props: Record<string, unknown>; data?: unknown }) {
  const src = String(props.src || '');
  if (!src) return null;
  return (
    <div className="overflow-hidden rounded-lg">
      {props.link ? <a href={String(props.link)}><img src={src} alt={String(props.alt || '')} className="w-full" /></a> : <img src={src} alt={String(props.alt || '')} className="w-full" />}
    </div>
  );
}
