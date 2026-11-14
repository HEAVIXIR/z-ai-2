import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
type T="TEXT"|"LONG_TEXT"|"INTEGER"|"DECIMAL"|"BOOLEAN"|"SELECT"|"MULTI_SELECT";
type F={key:string;fa:string;en:string;type:T;unit?:string;required?:boolean;filterable?:boolean;options?:string[]};
type Form={slug:string;fields:F[]};
const f=(key:string,fa:string,en:string,type:T,extra:Partial<F>={}):F=>({key,fa,en,type,...extra});
const commonService:F[]=[
 f("service_scope","دامنه خدمت","Service Scope","LONG_TEXT",{required:true}),
 f("supported_industries","صنایع تحت پوشش","Supported Industries","MULTI_SELECT",{options:["معدن","راهسازی","عمران","نفت و گاز","پتروشیمی","کارخانه","بندر","کشاورزی"]}),
 f("onsite_service","ارائه خدمت در محل","On-site Service","BOOLEAN"),
 f("service_area","محدوده جغرافیایی خدمت","Service Area","TEXT",{required:true,filterable:true}),
 f("response_time_hours","زمان پاسخ‌گویی","Response Time","INTEGER",{unit:"HOUR"}),
 f("team_size","تعداد نیروی متخصص","Team Size","INTEGER"),
 f("service_capacity","ظرفیت انجام خدمت","Service Capacity","TEXT"),
 f("warranty_terms","شرایط ضمانت خدمت","Service Warranty","TEXT"),
 f("certifications","مجوزها و گواهی‌ها","Certifications","LONG_TEXT"),
 f("service_price_basis","مبنای قیمت‌گذاری","Pricing Basis","SELECT",{options:["ساعتی","روزانه","پروژه‌ای","به‌ازای تن","به‌ازای دستگاه","توافقی"]})
];
const commonMineral:F[]=[
 f("mineral_type","نوع ماده معدنی","Mineral Type","TEXT",{required:true,filterable:true}),
 f("product_grade","عیار یا گرید محصول","Product Grade","TEXT",{required:true,filterable:true}),
 f("quantity_tons","تناژ قابل عرضه","Available Quantity","DECIMAL",{unit:"TON",required:true,filterable:true}),
 f("monthly_capacity_tons","ظرفیت ماهانه تأمین","Monthly Supply Capacity","DECIMAL",{unit:"TON"}),
 f("moisture_percent","رطوبت","Moisture","DECIMAL",{unit:"%",filterable:true}),
 f("size_distribution","دانه‌بندی","Size Distribution","TEXT"),
 f("chemical_analysis","آنالیز شیمیایی","Chemical Analysis","LONG_TEXT"),
 f("origin_mine","معدن یا مبدأ استخراج","Mine / Origin","TEXT"),
 f("delivery_terms","شرایط تحویل","Delivery Terms","SELECT",{options:["تحویل معدن","تحویل کارخانه","تحویل انبار","تحویل بندر","تحویل مقصد"]}),
 f("monthly_supply","تداوم تأمین ماهانه","Recurring Monthly Supply","BOOLEAN")
];
const forms:Form[]=[
 {slug:"excavator-repair",fields:[f("machine_make_models","برندها و مدل‌های تحت پوشش","Supported Makes & Models","LONG_TEXT",{required:true}),f("excavator_repair_scope","دامنه تعمیر بیل مکانیکی","Excavator Repair Scope","MULTI_SELECT",{options:["موتور","پمپ هیدرولیک","شیر کنترل","زیربندی","برق و ECU","گردان و گیربکس","بوم و استیک","بازسازی کامل"]}),f("max_machine_weight_ton","حداکثر وزن دستگاه تحت پوشش","Max Machine Weight","DECIMAL",{unit:"TON"}),f("field_diagnostics","عیب‌یابی در محل","Field Diagnostics","BOOLEAN"),f("overhaul_capability","توان بازسازی کامل","Overhaul Capability","BOOLEAN")]},
 {slug:"loader-repair",fields:[f("loader_types_supported","انواع لودر تحت پوشش","Supported Loader Types","MULTI_SELECT",{options:["چرخ لاستیکی","زنجیری","اسکیداستیر","کامپکت ترک","معدنی","زیرزمینی"]}),f("loader_repair_scope","دامنه تعمیر لودر","Loader Repair Scope","MULTI_SELECT",{options:["موتور","گیربکس","اکسل","هیدرولیک","فرمان","باکت و بازو","برق"]}),f("loader_payload_range","محدوده ظرفیت بار","Payload Range","TEXT"),f("field_service_radius_km","شعاع اعزام تعمیرکار","Field Service Radius","DECIMAL",{unit:"KM"})]},
 {slug:"bulldozer-repair",fields:[f("dozer_classes","کلاس بولدوزر تحت پوشش","Dozer Classes","TEXT"),f("undercarriage_service","تعمیر زیربندی","Undercarriage Service","BOOLEAN"),f("blade_ripper_repair","تعمیر تیغه و ریپر","Blade & Ripper Repair","BOOLEAN"),f("powertrain_repair","تعمیر پاورترین","Powertrain Repair","BOOLEAN")]},
 {slug:"grader-repair",fields:[f("grader_classes","کلاس گریدر تحت پوشش","Grader Classes","TEXT"),f("circle_moldboard_repair","تعمیر دایره و مولدبورد","Circle & Moldboard Repair","BOOLEAN"),f("articulation_repair","تعمیر مفصل‌بندی","Articulation Repair","BOOLEAN")]},
 {slug:"road-roller-repair",fields:[f("roller_types","انواع غلطک تحت پوشش","Roller Types","MULTI_SELECT",{options:["تک‌درام","دو‌درام","پاچه‌بزی","پنوماتیک","آسفالت"]}),f("vibration_system_repair","تعمیر سیستم ویبره","Vibration System Repair","BOOLEAN"),f("drum_reconditioning","بازسازی درام","Drum Reconditioning","BOOLEAN")]},
 {slug:"wagon-drill-repair",fields:[f("drill_types_supported","انواع دستگاه حفاری تحت پوشش","Supported Drill Types","MULTI_SELECT",{options:["دریل واگن","DTH","Top Hammer","RC","Core Drill","Jumbo"]}),f("compressor_service","تعمیر کمپرسور","Compressor Service","BOOLEAN"),f("hydraulic_feed_repair","تعمیر سیستم فید هیدرولیک","Hydraulic Feed Repair","BOOLEAN")]},
 {slug:"mining-truck-repair",fields:[f("truck_payload_range","محدوده ظرفیت دامپتراک","Truck Payload Range","TEXT"),f("electric_drive_repair","تعمیر سیستم درایو الکتریکی","Electric Drive Repair","BOOLEAN"),f("brake_system_repair","تعمیر سیستم ترمز","Brake System Repair","BOOLEAN"),f("mine_site_access","امکان فعالیت در معدن","Mine Site Access","BOOLEAN")]},
 {slug:"shovel-repair",fields:[f("shovel_types","انواع شاول تحت پوشش","Shovel Types","MULTI_SELECT",{options:["هیدرولیکی","برقی کابلی","مکانیکی"]}),f("rope_and_hoist_service","تعمیر سیم‌بکسل و وینچ","Rope & Hoist Service","BOOLEAN"),f("boom_structure_repair","تعمیر سازه بوم","Boom Structure Repair","BOOLEAN")]},
 {slug:"industrial-pump-repair",fields:[f("pump_types","انواع پمپ تحت پوشش","Pump Types","MULTI_SELECT",{options:["گریز از مرکز","دنده‌ای","پیستونی","اسکرو","دیافراگمی","مستغرق"]}),f("max_flow_m3h","حداکثر دبی قابل پشتیبانی","Maximum Flow","DECIMAL",{unit:"M3/H"}),f("max_pressure_bar","حداکثر فشار کاری","Maximum Pressure","DECIMAL",{unit:"BAR"}),f("alignment_and_vibration","هم‌محوری و آنالیز ارتعاش","Alignment & Vibration","BOOLEAN")]},
 {slug:"generator-repair",fields:[f("generator_power_range","محدوده توان ژنراتور","Generator Power Range","TEXT"),f("controller_brands","برند کنترلرهای تحت پوشش","Supported Controller Brands","TEXT"),f("load_bank_test","تست بانک بار","Load Bank Testing","BOOLEAN"),f("alternator_rewinding","سیم‌پیچی آلترناتور","Alternator Rewinding","BOOLEAN")]},
 {slug:"compressor-repair",fields:[f("compressor_types","انواع کمپرسور","Compressor Types","MULTI_SELECT",{options:["اسکرو","پیستونی","سانتریفیوژ","روتاری","بوستر"]}),f("max_pressure_bar","حداکثر فشار قابل پشتیبانی","Maximum Pressure","DECIMAL",{unit:"BAR"}),f("air_end_overhaul","تعمیر اساسی ایراند","Air-end Overhaul","BOOLEAN")]},
 {slug:"fuel-station-repair",fields:[f("dispenser_brands","برند دیسپنسرهای تحت پوشش","Dispenser Brands","TEXT"),f("meter_calibration","کالیبراسیون میتر","Meter Calibration","BOOLEAN"),f("tank_leak_test","تست نشتی مخزن","Tank Leak Test","BOOLEAN"),f("hazardous_area_certification","گواهی کار در محیط مستعد انفجار","Hazardous Area Certification","TEXT")]},
 {slug:"iron-ore-supply",fields:[f("fe_percent","درصد آهن Fe","Fe Content","DECIMAL",{unit:"%",required:true,filterable:true}),f("sio2_percent","سیلیس SiO2","Silica","DECIMAL",{unit:"%"}),f("al2o3_percent","آلومینا Al2O3","Alumina","DECIMAL",{unit:"%"}),f("phosphorus_percent","فسفر P","Phosphorus","DECIMAL",{unit:"%"}),f("iron_ore_form","شکل محصول","Product Form","SELECT",{options:["دانه‌بندی","کنسانتره","گندله","آگلومره"]})]},
 {slug:"copper-supply",fields:[f("cu_percent","درصد مس Cu","Copper Content","DECIMAL",{unit:"%",required:true,filterable:true}),f("sulfur_percent","گوگرد S","Sulfur","DECIMAL",{unit:"%"}),f("arsenic_ppm","آرسنیک","Arsenic","DECIMAL",{unit:"PPM"}),f("copper_product_form","شکل محصول","Copper Product Form","SELECT",{options:["سنگ معدن","کنسانتره","کاتد","شمش"]})]},
 {slug:"coal-supply",fields:[f("calorific_value_kcal","ارزش حرارتی","Calorific Value","DECIMAL",{unit:"KCAL/KG",required:true,filterable:true}),f("ash_percent","خاکستر","Ash","DECIMAL",{unit:"%"}),f("sulfur_percent","گوگرد","Sulfur","DECIMAL",{unit:"%"}),f("volatile_matter_percent","مواد فرار","Volatile Matter","DECIMAL",{unit:"%"}),f("coal_rank","رتبه زغال","Coal Rank","SELECT",{options:["حرارتی","کک‌شو","نیمه‌کک‌شو"]})]},
 {slug:"mineral-processing-service",fields:[f("processing_method","روش فرآوری","Processing Method","MULTI_SELECT",{options:["فلوتاسیون","ثقلی","مغناطیسی","لیچینگ","خردایش و دانه‌بندی"]}),f("throughput_tph","ظرفیت فرآوری","Throughput","DECIMAL",{unit:"T/H",required:true}),f("recovery_rate_percent","بازیابی","Recovery Rate","DECIMAL",{unit:"%"}),f("feed_specification","مشخصات خوراک","Feed Specification","LONG_TEXT")]},
 {slug:"mineral-assay-lab",fields:[f("assay_methods","روش‌های آنالیز","Assay Methods","MULTI_SELECT",{options:["XRF","XRD","Fire Assay","ICP","شیمی تر","دانه‌بندی"]}),f("sample_capacity_per_day","ظرفیت نمونه در روز","Daily Sample Capacity","INTEGER"),f("accreditation","استاندارد و اعتبار آزمایشگاه","Lab Accreditation","TEXT"),f("turnaround_days","زمان تحویل نتیجه","Turnaround Time","INTEGER",{unit:"DAY"})]}

 {slug:"lhd-repair",fields:[f("lhd_types","انواع LHD تحت پوشش","LHD Types","MULTI_SELECT",{options:["دیزلی","برقی","باتری","Low Profile"]}),f("bucket_rebuild","بازسازی باکت","Bucket Rebuild","BOOLEAN"),f("articulation_joint_repair","تعمیر مفصل مرکزی","Articulation Joint Repair","BOOLEAN"),f("underground_safety_systems","تعمیر سامانه‌های ایمنی زیرزمینی","Underground Safety Systems","LONG_TEXT")]},
 {slug:"drilling-equipment-repair",fields:[f("drill_technology","فناوری حفاری","Drilling Technology","MULTI_SELECT",{options:["DTH","Top Hammer","Rotary","RC","Core","Jumbo"]}),f("drill_rod_threading","تعمیر و رزوه‌کاری راد","Drill Rod & Threading","BOOLEAN"),f("compressor_rebuild","بازسازی کمپرسور","Compressor Rebuild","BOOLEAN"),f("mast_alignment","تنظیم دکل حفاری","Mast Alignment","BOOLEAN")]},
 {slug:"dimension-stone-supply",fields:[f("stone_types","نوع سنگ","Stone Types","MULTI_SELECT",{options:["مرمر","گرانیت","تراورتن","مرمریت","چینی","بازالت"]}),f("stone_block_dimensions","ابعاد کوپ یا اسلب","Block / Slab Dimensions","TEXT"),f("surface_finish","نوع فرآوری سطح","Surface Finish","MULTI_SELECT",{options:["خام","صیقلی","چرمی","تیشه‌ای","بوش‌همر"]}),f("color_grade","رنگ و سورت","Color & Grade","TEXT")]},
 {slug:"sand-gravel-supply",fields:[f("aggregate_type","نوع مصالح","Aggregate Type","MULTI_SELECT",{options:["ماسه طبیعی","ماسه شکسته","شن نخودی","شن بادامی","مخلوط"]}),f("grading_standard","استاندارد دانه‌بندی","Grading Standard","TEXT"),f("fineness_modulus","مدول نرمی","Fineness Modulus","DECIMAL"),f("clay_percent","درصد خاک و رس","Clay Content","DECIMAL",{unit:"%"})]},
 {slug:"cement-clinker-supply",fields:[f("cement_type","نوع سیمان یا کلینکر","Cement / Clinker Type","SELECT",{options:["کلینکر","تیپ ۱","تیپ ۲","تیپ ۵","پوزولانی","سفید"]}),f("so3_percent","درصد SO3","SO3","DECIMAL",{unit:"%"}),f("blaine_cm2g","نرمی بلین","Blaine Fineness","INTEGER",{unit:"CM2/G"}),f("compressive_strength_mpa","مقاومت فشاری","Compressive Strength","DECIMAL",{unit:"MPA"})]},
 {slug:"mine-exploration-surveying",fields:[f("exploration_stage","مرحله اکتشاف","Exploration Stage","SELECT",{options:["شناسایی","پی‌جویی","اکتشاف عمومی","اکتشاف تفصیلی"]}),f("survey_methods","روش‌های برداشت","Survey Methods","MULTI_SELECT",{options:["ژئوفیزیک","ژئوشیمی","نقشه‌برداری","مدل‌سازی سه‌بعدی","سنجش از دور"]}),f("licensed_experts","کارشناسان دارای صلاحیت","Licensed Experts","INTEGER"),f("deliverables","خروجی و گزارش تحویلی","Deliverables","LONG_TEXT")]},
 {slug:"exploration-drilling",fields:[f("drilling_depth_m","عمق حفاری","Drilling Depth","DECIMAL",{unit:"M",required:true}),f("drilling_diameter_mm","قطر حفاری","Drilling Diameter","DECIMAL",{unit:"MM"}),f("core_recovery_percent","درصد بازیابی مغزه","Core Recovery","DECIMAL",{unit:"%"}),f("drilling_methods","روش حفاری","Drilling Methods","MULTI_SELECT",{options:["مغزه‌گیری","RC","DTH","پودری"]})]},
 {slug:"mining-contracting",fields:[f("contracting_scope","دامنه پیمانکاری","Contracting Scope","MULTI_SELECT",{options:["باطله‌برداری","استخراج","بارگیری","حمل","آتشباری","نگهداری"]}),f("monthly_overburden_m3","ظرفیت ماهانه باطله‌برداری","Monthly Overburden","DECIMAL",{unit:"M3"}),f("monthly_ore_tons","ظرفیت ماهانه استخراج ماده معدنی","Monthly Ore","DECIMAL",{unit:"TON"}),f("fleet_summary","ترکیب ناوگان و تجهیزات","Fleet Summary","LONG_TEXT"),f("hse_certification","گواهی‌های HSE","HSE Certifications","TEXT")]},
 {slug:"mineral-haulage-service",fields:[f("haulage_capacity_tons","ظرفیت حمل","Haulage Capacity","DECIMAL",{unit:"TON",required:true}),f("fleet_types","انواع ناوگان","Fleet Types","MULTI_SELECT",{options:["دامپتراک","کامیون کمپرسی","تریلی","واگن ریلی"]}),f("route_distance_km","مسافت مسیر","Route Distance","DECIMAL",{unit:"KM"}),f("loading_unloading_assets","تجهیزات بارگیری و تخلیه","Loading / Unloading Assets","TEXT")]}
];
async function linkFields(categoryId:string,fields:F[]){
 for(let i=0;i<fields.length;i++){const x=fields[i];const data={key:x.key,name:x.fa,nameEn:x.en,labelFa:x.fa,labelEn:x.en,type:x.type,unit:x.unit??null,required:false,filterable:!!x.filterable,searchable:true,sortable:false,visibleOnCard:!!x.filterable,visibleOnDetail:true,seoRelevant:!!x.filterable,aiRelevant:true};
  const a=await db.attributeDefinition.upsert({where:{key:x.key},create:data,update:data});
  for(let j=0;j<(x.options??[]).length;j++){const value=x.options![j];const old=await db.attributeOption.findFirst({where:{attributeId:a.id,value}});if(old)await db.attributeOption.update({where:{id:old.id},data:{label:value,sortOrder:j}});else await db.attributeOption.create({data:{attributeId:a.id,value,label:value,sortOrder:j}});}
  await db.categoryAttribute.upsert({where:{categoryId_attributeId:{categoryId,attributeId:a.id}},create:{categoryId,attributeId:a.id,required:!!x.required,filterable:!!x.filterable,searchable:true,sortable:false,displayOrder:i},update:{required:!!x.required,filterable:!!x.filterable,searchable:true,sortable:false,displayOrder:i}});
 }
}
async function main(){
 const serviceRoot=await db.category.findUnique({where:{slug:"services"},select:{id:true}});
 const mineralRoot=await db.category.findUnique({where:{slug:"minerals-materials"},select:{id:true}});
 if(!serviceRoot||!mineralRoot)throw new Error("Missing service/mineral taxonomy roots; seed taxonomy first");
 await linkFields(serviceRoot.id,commonService); await linkFields(mineralRoot.id,commonMineral);
 const missing:string[]=[];let applied=0;
 for(const form of forms){const c=await db.category.findUnique({where:{slug:form.slug},select:{id:true}});if(!c){missing.push(form.slug);continue;}await linkFields(c.id,form.fields);applied++;}
 console.log(JSON.stringify({commonServiceFields:commonService.length,commonMineralFields:commonMineral.length,formsApplied:applied,missingForms:missing},null,2));
 if(missing.length)throw new Error("Missing category forms: "+missing.join(", "));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
