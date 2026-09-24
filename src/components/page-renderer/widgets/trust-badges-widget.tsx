'use client';
export default function TrustBadgesWidget({ props }: { props: Record<string, unknown>; data?: unknown }) {
  let badges: { title?: string; icon?: string }[] = [];
  try { badges = typeof props.badges === 'string' ? JSON.parse(props.badges) : (props.badges as any[]) || []; } catch {}
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {props.title && <span className="text-sm font-medium">{props.title}</span>}
      {badges.map((b, i) => <span key={i} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">{b.icon && <span>{b.icon}</span>}{b.title}</span>)}
    </div>
  );
}
