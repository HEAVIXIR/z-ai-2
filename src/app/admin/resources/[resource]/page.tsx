import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';
import { UniversalTable } from '@/components/admin/universal-table';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string }> };

export default async function ResourceListPage({ params }: Params) {
  const { resource: resourceKey } = await params;
  const config = registry.get(resourceKey);
  
  if (!config) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{config.titleFa}</h1>
          <p className="text-xs text-muted-foreground">{config.titleEn}</p>
        </div>
        <Link
          href={`/admin/resources/${resourceKey}/new`}
          className="rounded-md bg-[#F58220] px-4 py-2 text-xs font-medium text-white hover:bg-[#F58220]/90"
        >
          + افزودن
        </Link>
      </div>
      <UniversalTable config={config} />
    </div>
  );
}
