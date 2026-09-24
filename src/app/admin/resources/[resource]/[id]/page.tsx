import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';
import { UniversalDetail } from '@/components/admin/universal-detail';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string; id: string }> };

export default async function ResourceDetailPage({ params }: Params) {
  const { resource: resourceKey, id } = await params;
  const config = registry.get(resourceKey);
  
  if (!config) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="p-4 md:p-6">
      <UniversalDetail config={config} resourceId={id} />
    </div>
  );
}
