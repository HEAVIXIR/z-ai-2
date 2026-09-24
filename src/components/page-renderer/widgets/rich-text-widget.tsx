'use client';
export default function RichTextWidget({ props }: { props: Record<string, unknown>; data?: unknown }) {
  return (
    <div className="prose prose-sm max-w-none">
      {props.title && <h2 className="mb-2 font-bold">{props.title}</h2>}
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{props.content}</p>
    </div>
  );
}
