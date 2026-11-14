import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
type N = { name: string; nameEn: string; slug: string; children?: N[] };
const tree: N[] = [
 {name:"تعمیر ماشین‌آلات راهسازی",nameEn:"Road Machinery Repair",slug:"road-machinery-repair",children:[
  {name:"تعمیر بیل مکانیکی",nameEn:"Excavator Repair",slug:"excavator-repair"},{name:"تعمیر لودر",nameEn:"Loader Repair",slug:"loader-repair"},{name:"تعمیر بولدوزر",nameEn:"Bulldozer Repair",slug:"bulldozer-repair"},{name:"تعمیر گریدر",nameEn:"Grader Repair",slug:"grader-repair"},{name:"تعمیر غلطک",nameEn:"Road Roller Repair",slug:"road-roller-repair"},{name:"تعمیر دریل واگن",nameEn:"Wagon Drill Repair",slug:"wagon-drill-repair"}]},
 {name:"تعمیر ماشین‌آلات معدنی",nameEn:"Mining Machinery Repair",slug:"mining-machinery-repair",children:[
  {name:"تعمیر دامپتراک معدنی",nameEn:"Mining Truck Repair",slug:"mining-truck-repair"},{name:"تعمیر شاول",nameEn:"Shovel Repair",slug:"shovel-repair"},{name:"تعمیر LHD",nameEn:"LHD Repair",slug:"lhd-repair"},{name:"تعمیر تجهیزات حفاری",nameEn:"Drilling Equipment Repair",slug:"drilling-equipment-repair"}]},
 {name:"تعمیر تجهیزات صنعتی",nameEn:"Industrial Equipment Repair",slug:"industrial-equipment-repair",children:[
  {name:"تعمیر پمپ صنعتی",nameEn:"Industrial Pump Repair",slug:"industrial-pump-repair"},{name:"تعمیر ژنراتور",nameEn:"Generator Repair",slug:"generator-repair"},{name:"تعمیر کمپرسور",nameEn:"Compressor Repair",slug:"compressor-repair"},{name:"تعمیر تجهیزات جایگاه سوخت",nameEn:"Fuel Station Equipment Repair",slug:"fuel-station-repair"}]},
 {name:"تأمین و فروش مواد معدنی",nameEn:"Mineral Supply & Trading",slug:"mineral-supply-services",children:[
  {name:"تأمین سنگ آهن و کنسانتره",nameEn:"Iron Ore Supply",slug:"iron-ore-supply"},{name:"تأمین مس و کنسانتره مس",nameEn:"Copper Supply",slug:"copper-supply"},{name:"تأمین زغال سنگ",nameEn:"Coal Supply",slug:"coal-supply"},{name:"تأمین سنگ ساختمانی",nameEn:"Dimension Stone Supply",slug:"dimension-stone-supply"},{name:"تأمین شن و ماسه",nameEn:"Sand & Gravel Supply",slug:"sand-gravel-supply"},{name:"تأمین سیمان و کلینکر",nameEn:"Cement & Clinker Supply",slug:"cement-clinker-supply"}]},
 {name:"خدمات فنی معدن",nameEn:"Mining Technical Services",slug:"mining-technical-services",children:[
  {name:"اکتشاف معدن",nameEn:"Mine Exploration",slug:"mine-exploration-surveying"},{name:"حفاری اکتشافی",nameEn:"Exploration Drilling",slug:"exploration-drilling"},{name:"پیمانکاری استخراج معدن",nameEn:"Mining Contracting",slug:"mining-contracting"},{name:"فرآوری مواد معدنی",nameEn:"Mineral Processing",slug:"mineral-processing-service"},{name:"آزمایشگاه مواد معدنی",nameEn:"Mineral Assay Lab",slug:"mineral-assay-lab"},{name:"حمل مواد معدنی",nameEn:"Mineral Haulage",slug:"mineral-haulage-service"}]}
];
const minerals: Record<string,N[]> = {
 "iron-ore":[{name:"سنگ آهن دانه‌بندی",nameEn:"Sized Iron Ore",slug:"sized-iron-ore"},{name:"کنسانتره سنگ آهن",nameEn:"Iron Ore Concentrate",slug:"iron-ore-concentrate"},{name:"گندله",nameEn:"Iron Ore Pellets",slug:"iron-ore-pellets"},{name:"آگلومره",nameEn:"Sinter",slug:"iron-ore-sinter"}],
 "copper-ore":[{name:"کنسانتره مس",nameEn:"Copper Concentrate",slug:"copper-concentrate"},{name:"کاتد مس",nameEn:"Copper Cathode",slug:"copper-cathode"}],
 coal:[{name:"زغال سنگ حرارتی",nameEn:"Thermal Coal",slug:"thermal-coal"},{name:"زغال سنگ کک‌شو",nameEn:"Coking Coal",slug:"coking-coal"},{name:"کنسانتره زغال",nameEn:"Coal Concentrate",slug:"coal-concentrate"}]
};
async function insert(parentId:string,path:string,nodes:N[],level:number,layer:string,domain:string){
 for(let i=0;i<nodes.length;i++){const n=nodes[i];const taxPath=path+"/"+n.slug;
  const row=await db.category.upsert({where:{slug:n.slug},create:{name:n.name,nameEn:n.nameEn,slug:n.slug,parentId,level,layer,domain,taxPath,active:true,sortOrder:i+1},update:{name:n.name,nameEn:n.nameEn,parentId,level,layer,domain,taxPath,active:true,sortOrder:i+1},select:{id:true}});
  if(n.children?.length)await insert(row.id,taxPath,n.children,level+1,layer,domain);
 }
}
type PlannedCategory = { slug: string; parentSlug: string; layer: string; domain: string };
function collectPlan(nodes: N[], parentSlug: string, layer: string, domain: string, out: PlannedCategory[]) {
 for (const node of nodes) {
  out.push({ slug: node.slug, parentSlug, layer, domain });
  if (node.children?.length) collectPlan(node.children, node.slug, layer, domain, out);
 }
}
async function main(){
 const root=await db.category.findUnique({where:{slug:"services"},select:{id:true,slug:true,taxPath:true,level:true,layer:true,domain:true}});
 if(!root)throw new Error('Run seed-taxonomy-v11.ts first; services root missing');
 if(root.layer!=="SERVICE"||root.domain!=="SERVICE")throw new Error('The services root must have layer=SERVICE and domain=SERVICE; no writes were made');
 const mineralRoots=await db.category.findMany({where:{slug:{in:Object.keys(minerals)}},select:{id:true,slug:true,taxPath:true,level:true,layer:true,domain:true}});
 const mineralRootBySlug=new Map(mineralRoots.map(p=>[p.slug,p]));
 const plan:PlannedCategory[]=[];
 collectPlan(tree,root.slug,"SERVICE","SERVICE",plan);
 for(const [slug,nodes] of Object.entries(minerals)){
  const p=mineralRootBySlug.get(slug);
  if(p)collectPlan(nodes,slug,p.layer??"CATALOG",p.domain??"MATERIAL",plan);
 }
 const slugs=plan.map(x=>x.slug);
 if(new Set(slugs).size!==slugs.length)throw new Error("Duplicate category slug in supplemental taxonomy plan; no writes were made");
 const existing=await db.category.findMany({where:{slug:{in:slugs}},select:{id:true,slug:true,parentId:true,layer:true,domain:true}});
 const existingBySlug=new Map(existing.map(x=>[x.slug,x]));
 for(const item of plan){
  const row=existingBySlug.get(item.slug);
  if(!row)continue;
  const expectedParent=mineralRootBySlug.get(item.parentSlug)??existingBySlug.get(item.parentSlug)??(item.parentSlug===root.slug?root:null);
  if(!expectedParent||row.parentId!==expectedParent.id||row.layer!==item.layer||row.domain!==item.domain){
   throw new Error(`Category slug collision or parent/layer/domain mismatch for "${item.slug}" (expected parent "${item.parentSlug}", layer "${item.layer}", domain "${item.domain}"); no writes were made`);
  }
 }
 await insert(root.id,root.taxPath??"services",tree,(root.level??0)+1,"SERVICE","SERVICE");
 for(const [slug,nodes] of Object.entries(minerals)){const p=mineralRootBySlug.get(slug);if(p)await insert(p.id,p.taxPath??slug,nodes,(p.level??1)+1,p.layer??"CATALOG",p.domain??"MATERIAL");}
 await db.transactionType.upsert({where:{key:"SERVICE_OFFER"},create:{key:"SERVICE_OFFER",nameFa:"ارائه خدمات",nameEn:"Service Offer",icon:"wrench",sortOrder:2,active:true},update:{nameFa:"ارائه خدمات",nameEn:"Service Offer",icon:"wrench",sortOrder:2,active:true}});
 console.log("Supplemental service and mineral taxonomy seeded");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
