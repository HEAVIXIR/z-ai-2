import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';
import { UniversalForm } from '@/components/admin/universal-form';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ resource: string }> };

export default async function ResourceCreatePage({ params }: Params) {
  const { resource: resourceKey } = await params;
  const config = registry.get(resourceKey);
  
  if (!config) {
    redirect('/admin/dashboard');
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-lg font-bold">ایجاد {config.titleFa}</h1>
      <UniversalForm config={config} />
    </div>
  );
}
