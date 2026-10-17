import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Factory, HardHat, MonitorCog, ShieldCheck, UserRoundPlus, Users, UserX, DoorOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  createProductionUnit, deactivateProductionUnit, createContractor, deactivateContractor,
  createContractWorker, deactivateContractWorker, createVisitor, recordVisitorExit,
  createHoliday, createAttendanceDevice, deactivateAttendanceDevice,
} from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };
const errors: Record<string, string> = {
  forbidden: "Your role cannot access this operations workspace.",
  invalid: "The selected record is invalid. Refresh and try again.",
  date_range: "The end date must be on or after the start date.",
  plant_scope: "Select an active plant within your company and access scope.",
  department_scope: "The selected department must belong to the selected plant.",
  host_scope: "Choose an active host employee from the same company and plant.",
  unit_invalid: "Enter a valid production unit name, code, plant and optional department.",
  unit_duplicate: "That production unit code may already exist.",
  unit_save: "Production unit could not be saved. Check your access and plant/department selection.",
  contractor_invalid: "Enter a valid contractor name and code.",
  contractor_duplicate: "That contractor code may already exist.",
  contractor_save: "Contractor could not be saved.",
  contract_worker_invalid: "Check the contract worker details and dates.",
  contract_worker_duplicate: "That worker code may already exist.",
  contract_worker_save: "Contract worker could not be saved.",
  contractor_scope: "Choose an active contractor in your company.",
  visitor_invalid: "Enter a visitor name and visit purpose.",
  visitor_save: "Visitor entry could not be saved. Check your plant access.",
  visitor_exit: "Visitor exit could not be recorded. The visitor may already have checked out.",
  holiday_invalid: "Enter a holiday name, valid date and paid/unpaid choice.",
  holiday_save: "Holiday could not be saved. Check whether it already exists.",
  device_invalid: "Enter a device name and supported device type.",
  device_save: "Attendance device could not be saved.",
};
const successMessages: Record<string, string> = {
  unit: "Production unit created.", unit_deactivated: "Production unit deactivated; history retained.",
  contractor: "Contractor created.", contractor_deactivated: "Contractor deactivated; historical records retained.",
  contract_worker: "Contract worker added.", contract_worker_deactivated: "Contract worker deactivated.",
  visitor: "Visitor entry recorded.", visitor_exit: "Visitor exit recorded.",
  holiday: "Holiday added.", device: "Device record created as not configured.", device_deactivated: "Device disabled.",
};
const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-xs font-semibold text-slate-600";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#172B4D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#213b66] disabled:opacity-50";
const dangerClass = "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50";
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + (value.length === 10 ? "T12:00:00Z" : ""))) : "—";

function Panel({ title, description, icon: Icon, children }: { title: string; description: string; icon: typeof Factory; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4"><span className="rounded-xl bg-slate-100 p-2.5 text-[#172B4D]"><Icon size={19}/></span><div><h2 className="font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div></div><div className="p-5">{children}</div></section>;
}
function Field({ label, name, required = false, type = "text", placeholder, defaultValue }: { label: string; name: string; required?: boolean; type?: string; placeholder?: string; defaultValue?: string }) {
  return <label className={labelClass}>{label}<input className={inputClass} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue}/></label>;
}
function SelectField({ label, name, options, required = false, emptyLabel }: { label: string; name: string; options: { value: string; label: string }[]; required?: boolean; emptyLabel?: string }) {
  return <label className={labelClass}>{label}<select className={inputClass} name={name} required={required} defaultValue="">{emptyLabel && <option value="">{emptyLabel}</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{text}</p>; }

export default async function OperationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("company_id,full_name,role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id || !["super_admin","hr_manager","plant_manager","department_supervisor"].includes(profile.role)) redirect("/dashboard?error=forbidden");

  const isAdmin = ["super_admin","hr_manager"].includes(profile.role);
  const canContract = ["super_admin","hr_manager","plant_manager"].includes(profile.role);
  const canVisitor = ["super_admin","hr_manager","plant_manager","department_supervisor"].includes(profile.role);
  const [{data: plants}, {data: departments}, {data: units}, {data: contractors}, {data: contractWorkers}, {data: visitors}, {data: holidays}, {data: devices}, {data: employees}] = await Promise.all([
    supabase.from("plants").select("id,name,code").eq("company_id",profile.company_id).eq("active",true).order("name"),
    supabase.from("departments").select("id,name,plant_id").eq("company_id",profile.company_id).eq("active",true).order("name"),
    supabase.from("production_units").select("id,name,code,plant_id,department_id,active").eq("company_id",profile.company_id).order("name").limit(200),
    supabase.from("contractors").select("id,name,code,contact_name,contact_phone,valid_from,valid_to,active").eq("company_id",profile.company_id).order("name").limit(200),
    supabase.from("contract_workers").select("id,contractor_id,plant_id,department_id,worker_code,full_name,valid_from,valid_to,active").eq("company_id",profile.company_id).order("full_name").limit(300),
    supabase.from("visitors").select("id,visitor_name,organization,purpose,plant_id,entry_at,exit_at,authorization_status").eq("company_id",profile.company_id).order("entry_at",{ascending:false}).limit(100),
    supabase.from("holidays").select("id,holiday_date,name,plant_id,paid").eq("company_id",profile.company_id).order("holiday_date",{ascending:false}).limit(200),
    supabase.from("attendance_devices").select("id,name,device_type,external_device_id,plant_id,integration_status,active,last_synced_at").eq("company_id",profile.company_id).order("name").limit(200),
    supabase.from("employees").select("id,employee_code,full_name,plant_id,department_id").eq("company_id",profile.company_id).eq("employment_status","active").order("full_name").limit(1000),
  ]);

  const plantRows = plants ?? [], departmentRows = departments ?? [], unitRows = units ?? [], contractorRows = contractors ?? [];
  const workerRows = contractWorkers ?? [], visitorRows = visitors ?? [], holidayRows = holidays ?? [], deviceRows = devices ?? [], employeeRows = employees ?? [];
  const plantMap = new Map(plantRows.map(x => [x.id, x.name]));
  const departmentMap = new Map(departmentRows.map(x => [x.id, x.name]));
  const contractorMap = new Map(contractorRows.map(x => [x.id, x.name]));
  const employeeMap = new Map(employeeRows.map(x => [x.id, x.full_name + " (" + x.employee_code + ")"]));
  const plantOptions = plantRows.map(x => ({value:x.id,label:x.name + " · " + x.code}));
  const departmentOptions = departmentRows.map(x => ({value:x.id,label:x.name}));
  const contractorOptions = contractorRows.filter(x=>x.active).map(x=>({value:x.id,label:x.name + " · " + x.code}));

  return <main className="min-h-screen bg-[#edf1f5] text-slate-900">
    <header className="bg-[#151b22] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-amber-300"><Factory size={22}/></span><div><p className="font-bold">IAMS <span className="font-normal text-slate-400">/ INDUSTRIAL OPERATIONS</span></p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">Plant, contractor & gate control</p></div></div><Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"><ArrowLeft size={15}/> Dashboard</Link></div></header>
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-7">
      <section className="rounded-3xl bg-gradient-to-br from-[#263648] to-[#121820] p-6 text-white shadow-lg sm:p-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Phase 1 · Operational control</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Industrial Operations</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Manage production units, contractor workforce, visitor gate entries, holidays and device inventory in one company-scoped workspace.</p></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><p className="text-xl font-bold">{unitRows.filter(x=>x.active).length}</p><p className="mt-1 text-[10px] text-slate-300">Units</p></div><div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><p className="text-xl font-bold">{workerRows.filter(x=>x.active).length}</p><p className="mt-1 text-[10px] text-slate-300">Contract staff</p></div><div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><p className="text-xl font-bold">{visitorRows.filter(x=>!x.exit_at).length}</p><p className="mt-1 text-[10px] text-slate-300">On site</p></div></div></div></section>

      {params.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{errors[params.error] ?? "The requested operation failed. Check your role and entered details."}</div>}
      {params.success && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 size={18}/>{successMessages[params.success] ?? "Operation completed."}</div>}
      <div className="grid gap-5 xl:grid-cols-2">
        {isAdmin && <Panel title="Production units" description="Create machining, fabrication, welding, assembly or finishing lines within a plant." icon={Building2}>
          <form action={createProductionUnit} className="grid gap-3 sm:grid-cols-2"><Field label="Unit name" name="name" required placeholder="CNC Machining Line A"/><Field label="Unit code" name="code" required placeholder="CNC-A"/><SelectField label="Plant" name="plant_id" options={plantOptions} required emptyLabel="Select plant"/><SelectField label="Department (optional)" name="department_id" options={departmentOptions} emptyLabel="No department"/><button className={buttonClass+" sm:col-span-2"} type="submit">Create production unit</button></form>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-2">Unit</th><th>Plant / department</th><th>Status</th><th></th></tr></thead><tbody>{unitRows.map(x=><tr key={x.id} className="border-t border-slate-100"><td className="py-3"><p className="font-semibold">{x.name}</p><p className="text-xs text-slate-500">{x.code}</p></td><td className="text-xs text-slate-600">{plantMap.get(x.plant_id) ?? "—"}<br/>{departmentMap.get(x.department_id) ?? ""}</td><td><span className={"rounded-full px-2 py-1 text-xs "+(x.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>{x.active?"Active":"Inactive"}</span></td><td>{x.active && <form action={deactivateProductionUnit}><input type="hidden" name="id" value={x.id}/><button className={dangerClass}>Deactivate</button></form>}</td></tr>)}</tbody></table>{!unitRows.length&&<Empty text="No production units yet."/ >}</div>
        </Panel>}

        {canContract && <Panel title="Contractor companies" description="Maintain contractor identity and contract validity dates." icon={Users}>
          <form action={createContractor} className="grid gap-3 sm:grid-cols-2"><Field label="Company name" name="name" required placeholder="ABC Industrial Services"/><Field label="Contractor code" name="code" required placeholder="ABC-01"/><Field label="Contact person" name="contact_name" placeholder="Site coordinator"/><Field label="Contact phone" name="contact_phone" placeholder="+91…"/><Field label="Valid from (optional)" name="valid_from" type="date"/><Field label="Valid until (optional)" name="valid_to" type="date"/><button className={buttonClass+" sm:col-span-2"}>Add contractor</button></form>
          <div className="mt-5 space-y-2">{contractorRows.map(x=><div key={x.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-semibold">{x.name} <span className="text-xs text-slate-400">· {x.code}</span></p><p className="mt-1 text-xs text-slate-500">{x.contact_name||"No contact"} {x.contact_phone?"· "+x.contact_phone:""} · Valid {dateLabel(x.valid_from)} to {dateLabel(x.valid_to)}</p></div><div className="flex items-center gap-2"><span className={"rounded-full px-2 py-1 text-xs "+(x.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>{x.active?"Active":"Inactive"}</span>{x.active&&<form action={deactivateContractor}><input type="hidden" name="id" value={x.id}/><button className={dangerClass}>Deactivate</button></form>}</div></div>)}{!contractorRows.length&&<Empty text="No contractor companies yet."/ >}</div>
        </Panel>}

        {canContract && <Panel title="Contract workers" description="Register contract staff with contractor, plant and contract period. This does not create a worker login account." icon={HardHat}>
          <form action={createContractWorker} className="grid gap-3 sm:grid-cols-2"><Field label="Full name" name="full_name" required placeholder="Worker name"/><Field label="Worker code" name="worker_code" required placeholder="CW-001"/><SelectField label="Contractor" name="contractor_id" options={contractorOptions} required emptyLabel="Select contractor"/><SelectField label="Plant" name="plant_id" options={plantOptions} required emptyLabel="Select plant"/><SelectField label="Department (optional)" name="department_id" options={departmentOptions} emptyLabel="No department"/><Field label="Valid from" name="valid_from" type="date" required/><Field label="Valid until (optional)" name="valid_to" type="date"/><button className={buttonClass+" sm:col-span-2"}>Register contract worker</button></form>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-2">Worker</th><th>Contractor / plant</th><th>Validity</th><th>Status</th><th></th></tr></thead><tbody>{workerRows.map(x=><tr key={x.id} className="border-t border-slate-100"><td className="py-3"><p className="font-semibold">{x.full_name}</p><p className="text-xs text-slate-500">{x.worker_code}</p></td><td className="text-xs text-slate-600">{contractorMap.get(x.contractor_id)??"—"}<br/>{plantMap.get(x.plant_id)??"—"}</td><td className="text-xs text-slate-600">{dateLabel(x.valid_from)} – {dateLabel(x.valid_to)}</td><td><span className={"rounded-full px-2 py-1 text-xs "+(x.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>{x.active?"Active":"Inactive"}</span></td><td>{x.active&&<form action={deactivateContractWorker}><input type="hidden" name="id" value={x.id}/><button className={dangerClass}>Deactivate</button></form>}</td></tr>)}</tbody></table>{!workerRows.length&&<Empty text="No contract workers registered."/ >}</div>
        </Panel>}

        {canVisitor && <Panel title="Visitor gate register" description="Record visitor entry and host, then mark the exit when they leave the plant." icon={DoorOpen}>
          <form action={createVisitor} className="grid gap-3 sm:grid-cols-2"><Field label="Visitor name" name="visitor_name" required placeholder="Visitor full name"/><Field label="Organization" name="organization" placeholder="Supplier / customer"/><SelectField label="Plant" name="plant_id" options={plantOptions} emptyLabel="General / unassigned"/><SelectField label="Host employee (optional)" name="host_employee_id" options={employeeRows.map(x=>({value:x.id,label:employeeMap.get(x.id)??x.full_name}))} emptyLabel="Choose host"/><label className={labelClass+" sm:col-span-2"}>Purpose<input className={inputClass} name="purpose" required maxLength={300} placeholder="Maintenance visit, delivery, audit…"/></label><button className={buttonClass+" sm:col-span-2"}>Record visitor entry</button></form>
          <div className="mt-5 space-y-2">{visitorRows.map(x=><div key={x.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-semibold">{x.visitor_name}<span className="text-xs font-normal text-slate-500"> · {x.organization||"Individual"}</span></p><p className="mt-1 text-xs text-slate-500">{plantMap.get(x.plant_id)??"General"} · {x.purpose} · In {dateLabel(x.entry_at)}</p></div>{!x.exit_at?<form action={recordVisitorExit}><input type="hidden" name="id" value={x.id}/><button className={buttonClass}><UserX size={14}/> Check out</button></form>:<span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">Exited {dateLabel(x.exit_at)}</span>}</div>)}{!visitorRows.length&&<Empty text="No visitor entries yet."/ >}</div>
        </Panel>}

        {isAdmin && <Panel title="Plant holidays" description="Add paid or unpaid plant-wide or plant-specific holidays. Records are retained for historical reporting." icon={CalendarDays}>
          <form action={createHoliday} className="grid gap-3 sm:grid-cols-2"><Field label="Holiday name" name="name" required placeholder="Annual maintenance shutdown"/><Field label="Date" name="holiday_date" type="date" required/><SelectField label="Plant (optional)" name="plant_id" options={plantOptions} emptyLabel="All plants"/><SelectField label="Paid holiday?" name="paid" options={[{value:"yes",label:"Paid"},{value:"no",label:"Unpaid"}]} required/><button className={buttonClass+" sm:col-span-2"}>Add holiday</button></form>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[400px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-2">Date</th><th>Holiday</th><th>Plant</th><th>Type</th></tr></thead><tbody>{holidayRows.map(x=><tr key={x.id} className="border-t border-slate-100"><td className="py-3">{dateLabel(x.holiday_date)}</td><td className="font-semibold">{x.name}</td><td>{plantMap.get(x.plant_id)??"All plants"}</td><td><span className={"rounded-full px-2 py-1 text-xs "+(x.paid?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700")}>{x.paid?"Paid":"Unpaid"}</span></td></tr>)}</tbody></table>{!holidayRows.length&&<Empty text="No holidays configured."/ >}</div>
        </Panel>}

        {isAdmin && <Panel title="Attendance device inventory" description="Register biometric, RFID or CSV devices. Registration is inventory only until an actual vendor integration is configured and tested." icon={MonitorCog}>
          <form action={createAttendanceDevice} className="grid gap-3 sm:grid-cols-2"><Field label="Device name" name="name" required placeholder="Gate 1 fingerprint reader"/><SelectField label="Device type" name="device_type" options={[{value:"biometric",label:"Biometric"},{value:"rfid",label:"RFID"},{value:"csv_import",label:"CSV import"},{value:"simulator",label:"Simulator / test"},{value:"other",label:"Other"}]} required emptyLabel="Select device type"/><SelectField label="Plant (optional)" name="plant_id" options={plantOptions} emptyLabel="Company-wide"/><Field label="Vendor device ID (optional)" name="external_device_id" placeholder="Device serial / terminal ID"/><button className={buttonClass+" sm:col-span-2"}>Register device</button></form>
          <div className="mt-5 space-y-2">{deviceRows.map(x=><div key={x.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-semibold">{x.name}</p><p className="mt-1 text-xs text-slate-500">{x.device_type.toUpperCase()} · {plantMap.get(x.plant_id)??"Company-wide"} · ID: {x.external_device_id||"—"}</p><p className="mt-1 text-[11px] text-amber-700">Integration: {x.integration_status.replaceAll("_"," ")}</p></div><div className="flex items-center gap-2"><span className={"rounded-full px-2 py-1 text-xs "+(x.active?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-500")}>{x.active?"Active":"Disabled"}</span>{x.active&&<form action={deactivateAttendanceDevice}><input type="hidden" name="id" value={x.id}/><button className={dangerClass}>Disable</button></form>}</div></div>)}{!deviceRows.length&&<Empty text="No attendance devices registered."/ >}</div>
        </Panel>}
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldCheck size={19} className="mt-0.5 shrink-0"/><p><strong>Access and data safety:</strong> every operation is checked against the signed-in user's company and role, with Supabase RLS as a second boundary. Deactivation is used instead of deleting contractor, unit, worker or device history. Device records remain marked <strong>not configured</strong> until a real integration is tested.</p></div>
    </div>
  </main>;
}
