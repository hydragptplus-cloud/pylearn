"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { api, jsonBody, unwrap } from "@/lib/api";
import { useApiData } from "@/hooks/use-api-data";
import { useAuth } from "@/components/auth-provider";
import { Empty, ErrorMessage, Loading, LoadingModal, Modal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import type { Course } from "@/lib/types";

type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";
type MethodCode = "BKASH" | "NAGAD" | "BANK_PAY";
type Method = { id:number; method:MethodCode; display_name:string; account_details:string; account_holder:string; instructions:string; is_active:boolean };
type Payment = {
  id:number; student_name:string; course_title:string; payment_method:number; method:MethodCode;
  method_display_name:string; account_details_snapshot:string; account_holder_snapshot:string;
  sender_details:string; transaction_id:string; course_price_snapshot:string; amount:string; currency:"BDT";
  payment_date:string; status:PaymentStatus; admin_note:string; reviewer_name:string; created_at:string; reviewed_at?:string|null;
};
type MethodForm = Omit<Method, "id">;

const emptyMethod: MethodForm = { method:"BKASH", display_name:"", account_details:"", account_holder:"", instructions:"", is_active:true };
const money = (value:string|number) => new Intl.NumberFormat("en-BD", { style:"currency", currency:"BDT", minimumFractionDigits:0, maximumFractionDigits:2 }).format(Number(value));

export function PaymentsPage() {
  const { user, loading:authLoading } = useAuth();
  const [searchQuery,setSearchQuery] = useState("");
  const [statusFilter,setStatusFilter] = useState<"ALL"|PaymentStatus>("ALL");
  const [methodFilter,setMethodFilter] = useState<"ALL"|MethodCode>("ALL");
  const paymentPath = useMemo(()=>{
    if(!user)return null;
    if(user.role!=="ADMIN")return "/payments/";
    const params=new URLSearchParams();
    if(searchQuery.trim())params.set("q",searchQuery.trim());
    if(statusFilter!=="ALL")params.set("status",statusFilter);
    if(methodFilter!=="ALL")params.set("method",methodFilter);
    const query=params.toString();
    return `/payments/${query?`?${query}`:""}`;
  },[methodFilter,searchQuery,statusFilter,user]);
  const list = useApiData<Payment[]|{results:Payment[]}>(paymentPath);
  const methods = useApiData<Method[]|{results:Method[]}>(user && user.role !== "INSTRUCTOR" ? "/payment-methods/" : null);
  const courses = useApiData<Course[]|{results:Course[]}>(user?.role === "STUDENT" ? "/courses/" : null);
  const [selectedCourseId,setSelectedCourseId] = useState("");
  const [selectedMethodId,setSelectedMethodId] = useState("");
  const [editingMethod,setEditingMethod] = useState<Method|null>(null);
  const [methodForm,setMethodForm] = useState<MethodForm>(emptyMethod);
  const [message,setMessage] = useState("");
  const [formError,setFormError] = useState("");
  const [busyMessage,setBusyMessage] = useState("");
  const [proofUrl,setProofUrl] = useState("");
  const [proofTitle,setProofTitle] = useState("");

  const methodRows = useMemo(() => unwrap(methods.data||[]),[methods.data]);
  const courseRows = useMemo(() => unwrap(courses.data||[]).filter(c=>c.course_type==="PAID"&&!c.is_enrolled),[courses.data]);
  const selectedCourse = courseRows.find(c=>String(c.id)===selectedCourseId);
  const selectedMethod = methodRows.find(m=>String(m.id)===selectedMethodId);

  useEffect(()=>{ if(typeof window==="undefined"||selectedCourseId)return; const requested=new URLSearchParams(window.location.search).get("course"); if(requested&&courseRows.some(c=>String(c.id)===requested))setSelectedCourseId(requested); },[courseRows,selectedCourseId]);
  useEffect(()=>()=>{ if(proofUrl)URL.revokeObjectURL(proofUrl); },[proofUrl]);

  function resetMethodForm(){setEditingMethod(null);setMethodForm(emptyMethod)}
  function editMethod(method:Method){setEditingMethod(method);setMethodForm({method:method.method,display_name:method.display_name,account_details:method.account_details,account_holder:method.account_holder,instructions:method.instructions,is_active:method.is_active})}

  async function saveMethod(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setFormError("");setMessage("");setBusyMessage(editingMethod?"Updating payment account…":"Adding payment account…");
    try{await api(editingMethod?`/payment-methods/${editingMethod.id}/`:"/payment-methods/",{method:editingMethod?"PATCH":"POST",body:jsonBody(methodForm)});await methods.reload();setMessage(editingMethod?"Payment account updated.":"Payment account added.");resetMethodForm()}
    catch(error){setFormError(error instanceof Error?error.message:"Unable to save payment account.")}finally{setBusyMessage("")}
  }
  async function toggleMethod(method:Method){
    setFormError("");setBusyMessage(method.is_active?"Deactivating payment account…":"Activating payment account…");
    try{await api(`/payment-methods/${method.id}/`,{method:"PATCH",body:jsonBody({is_active:!method.is_active})});await methods.reload();setMessage(`Payment account ${method.is_active?"deactivated":"activated"}.`)}
    catch(error){setFormError(error instanceof Error?error.message:"Unable to update payment account.")}finally{setBusyMessage("")}
  }
  async function submitPayment(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setMessage("");setFormError("");
    if(!selectedCourse||!selectedMethod){setFormError("Select a paid course and active payment account.");return}
    const form=event.currentTarget;const body=new FormData(form);body.set("course",String(selectedCourse.id));body.set("payment_method",String(selectedMethod.id));body.set("amount",selectedCourse.price);setBusyMessage("Submitting payment for review…");
    try{await api("/payments/",{method:"POST",body});form.reset();setSelectedCourseId("");setSelectedMethodId("");await list.reload();setMessage("Payment submitted. An admin will review it before enrollment.")}
    catch(error){setFormError(error instanceof Error?error.message:"Unable to submit payment.")}finally{setBusyMessage("")}
  }
  async function review(id:number,decision:"APPROVED"|"REJECTED"){
    const admin_note=decision==="REJECTED"?window.prompt("Enter the rejection reason:")?.trim()||"":"";if(decision==="REJECTED"&&!admin_note)return;setBusyMessage(`${decision==="APPROVED"?"Approving":"Rejecting"} payment…`);
    try{await api(`/payments/${id}/review/`,{method:"POST",body:jsonBody({decision,admin_note})});await list.reload();setMessage(`Payment ${decision.toLowerCase()}.`)}
    catch(error){setFormError(error instanceof Error?error.message:"Unable to review payment.")}finally{setBusyMessage("")}
  }
  async function openProof(payment:Payment){
    setBusyMessage("Loading private receipt…");setFormError("");
    try{const response=await fetch(`/backend-api/payments/${payment.id}/proof/`,{credentials:"include"});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.detail||"Unable to load payment proof.")}if(proofUrl)URL.revokeObjectURL(proofUrl);setProofUrl(URL.createObjectURL(await response.blob()));setProofTitle(`${payment.student_name}: ${payment.course_title}`)}
    catch(error){setFormError(error instanceof Error?error.message:"Unable to load payment proof.")}finally{setBusyMessage("")}
  }
  function closeProof(){if(proofUrl)URL.revokeObjectURL(proofUrl);setProofUrl("");setProofTitle("")}

  if(authLoading||list.loading||methods.loading||courses.loading)return <Loading variant="dashboard"/>;
  if(user?.role==="INSTRUCTOR")return <ErrorMessage message="Payment details are private and available only to students and administrators."/>;
  const payments=unwrap(list.data||[]);

  return <div className="space-y-6">
    <LoadingModal open={Boolean(busyMessage)} title="Please wait" message={busyMessage}/>
    <PageHeader title="Payment Management" description="Manual bKash, Nagad, and Bank Pay review in BDT."/>
    {(list.error||methods.error||courses.error||formError)&&<ErrorMessage message={list.error||methods.error||courses.error||formError}/>}
    {message&&<div className="panel border-[var(--success)] p-4 text-sm font-semibold text-[var(--success)]">{message}</div>}

    {user?.role==="ADMIN"&&<>
      <form className="panel grid gap-4 p-5 md:grid-cols-2" onSubmit={saveMethod}>
        <div className="md:col-span-2 flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{editingMethod?"Edit payment account":"Add payment account"}</h2><p className="muted text-sm">Multiple accounts per payment method are supported.</p></div>{editingMethod&&<button className="btn btn-secondary" type="button" onClick={resetMethodForm}>Cancel edit</button>}</div>
        <ModernSelect className="field" aria-label="Payment method" value={methodForm.method} onValueChange={value=>setMethodForm({...methodForm,method:value as MethodCode})} required options={[{value:"BKASH",label:"bKash"},{value:"NAGAD",label:"Nagad"},{value:"BANK_PAY",label:"Bank Pay"}]}/>
        <input className="field" value={methodForm.display_name} onChange={e=>setMethodForm({...methodForm,display_name:e.target.value})} placeholder="Display name, e.g. bKash Merchant" required/>
        <textarea className="field" value={methodForm.account_details} onChange={e=>setMethodForm({...methodForm,account_details:e.target.value})} placeholder="Account number or bank details" required/>
        <input className="field" value={methodForm.account_holder} onChange={e=>setMethodForm({...methodForm,account_holder:e.target.value})} placeholder="Account holder"/>
        <textarea className="field md:col-span-2" value={methodForm.instructions} onChange={e=>setMethodForm({...methodForm,instructions:e.target.value})} placeholder="Instructions shown to students"/>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={methodForm.is_active} onChange={e=>setMethodForm({...methodForm,is_active:e.target.checked})}/> Active for student submissions</label>
        <button className="btn btn-primary">{editingMethod?"Save changes":"Add payment account"}</button>
      </form>
      <div className="grid-cards">{methodRows.map(m=><article className="panel space-y-2 p-4" key={m.id}><div className="flex items-start justify-between gap-3"><div><span className="badge">{m.method.replace("_"," ")}</span><h3 className="mt-2 font-bold">{m.display_name}</h3></div><span className="badge">{m.is_active?"ACTIVE":"INACTIVE"}</span></div><p className="whitespace-pre-wrap text-sm">{m.account_details}</p><p className="muted text-sm">{m.account_holder||"No account holder supplied"}</p><p className="muted whitespace-pre-wrap text-sm">{m.instructions}</p><div className="flex gap-2 pt-2"><button className="btn btn-secondary" onClick={()=>editMethod(m)}>Edit</button><button className="btn btn-secondary" onClick={()=>void toggleMethod(m)}>{m.is_active?"Deactivate":"Activate"}</button></div></article>)}</div>
    </>}

    {user?.role==="STUDENT"&&<>
      <div className="grid-cards">{methodRows.map(m=><article className="panel space-y-2 p-4" key={m.id}><span className="badge">{m.method.replace("_"," ")}</span><h2 className="font-bold">{m.display_name}</h2><p className="whitespace-pre-wrap">{m.account_details}</p><p className="muted text-sm">{m.account_holder}</p><p className="muted whitespace-pre-wrap text-sm">{m.instructions}</p></article>)}</div>
      <form className="panel grid gap-4 p-5 md:grid-cols-2" onSubmit={submitPayment} encType="multipart/form-data">
        <div className="md:col-span-2"><h2 className="text-xl font-bold">Submit course payment</h2><p className="muted text-sm">Enrollment begins only after admin approval.</p></div>
        <ModernSelect className="field" aria-label="Paid course" value={selectedCourseId} onValueChange={setSelectedCourseId} placeholder="Select paid course" required options={courseRows.map(c=>({value:c.id,label:`${c.title}: ${money(c.price)}`}))}/>
        <ModernSelect className="field" aria-label="Payment account" value={selectedMethodId} onValueChange={setSelectedMethodId} placeholder="Select payment account" required options={methodRows.map(m=>({value:m.id,label:`${m.display_name} (${m.method.replace("_"," ")})`}))}/>
        {selectedMethod&&<div className="panel md:col-span-2 p-4 text-sm"><strong>{selectedMethod.display_name}</strong><p className="mt-1 whitespace-pre-wrap">{selectedMethod.account_details}</p><p className="muted mt-1 whitespace-pre-wrap">{selectedMethod.instructions}</p></div>}
        <input className="field" name="sender_details" placeholder="Sender account / bank details" required/><input className="field" name="transaction_id" placeholder="Transaction / reference ID" required/>
        <label className="block space-y-1"><span className="text-sm font-semibold">Exact amount (BDT)</span><input className="field" value={selectedCourse?selectedCourse.price:""} placeholder="Select a course" readOnly/></label>
        <label className="block space-y-1"><span className="text-sm font-semibold">Payment date</span><input className="field" name="payment_date" type="date" required/></label>
        <label className="block space-y-1 md:col-span-2"><span className="text-sm font-semibold">Receipt image</span><input className="field" name="proof" type="file" accept="image/jpeg,image/png,image/webp" required/></label>
        <button className="btn btn-primary md:col-span-2">Submit payment for review</button>
      </form>
    </>}

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Payment records</h2></div>
      {user?.role==="ADMIN"&&<div className="panel grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} aria-hidden="true"/><input className="field !pl-11" value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} placeholder="Search student, transaction, course, sender, amount…" aria-label="Search payments"/></div>
        <ModernSelect className="field" aria-label="Payment status" value={statusFilter} onValueChange={value=>setStatusFilter(value as "ALL"|PaymentStatus)} options={[{value:"ALL",label:"All statuses"},{value:"PENDING",label:"Pending"},{value:"APPROVED",label:"Approved"},{value:"REJECTED",label:"Rejected"}]}/>
        <ModernSelect className="field" aria-label="Payment method filter" value={methodFilter} onValueChange={value=>setMethodFilter(value as "ALL"|MethodCode)} options={[{value:"ALL",label:"All methods"},{value:"BKASH",label:"bKash"},{value:"NAGAD",label:"Nagad"},{value:"BANK_PAY",label:"Bank Pay"}]}/>
        <button className="btn btn-secondary" type="button" disabled={!searchQuery&&statusFilter==="ALL"&&methodFilter==="ALL"} onClick={()=>{setSearchQuery("");setStatusFilter("ALL");setMethodFilter("ALL")}}><X size={16} aria-hidden="true"/>Clear</button>
      </div>}
      {!payments.length?<Empty message="No payment records."/>:payments.map(p=><article className="panel space-y-3 p-4" key={p.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{p.course_title}</strong><p className="muted text-sm">{p.student_name} · {p.method_display_name} · {p.transaction_id}</p></div><span className="badge">{p.status}</span></div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><span className="muted block text-xs">Amount paid</span>{money(p.amount)}</div><div><span className="muted block text-xs">Captured course price</span>{money(p.course_price_snapshot)}</div><div><span className="muted block text-xs">Payment date</span>{new Date(`${p.payment_date}T00:00:00`).toLocaleDateString()}</div><div><span className="muted block text-xs">Submitted</span>{new Date(p.created_at).toLocaleString()}</div></div>
        {user?.role==="ADMIN"&&<div className="grid gap-2 rounded-lg border border-[var(--border)] p-3 text-sm sm:grid-cols-2"><p><span className="muted block text-xs">Sender details</span>{p.sender_details}</p><p><span className="muted block text-xs">Paid to</span>{p.account_details_snapshot}</p></div>}
        {p.reviewed_at&&<p className="muted text-sm">Reviewed by {p.reviewer_name||"Administrator"} on {new Date(p.reviewed_at).toLocaleString()}</p>}{p.admin_note&&<p className="text-sm"><strong>{p.status==="REJECTED"?"Rejection reason:":"Admin note:"}</strong> {p.admin_note}</p>}
        {user?.role==="STUDENT"&&p.status==="REJECTED"&&<p className="muted text-sm">Correct the payment details and submit again with a new transaction reference.</p>}
        {user?.role==="ADMIN"&&<div className="flex flex-wrap gap-2"><button className="btn btn-secondary" onClick={()=>void openProof(p)}>View receipt</button>{p.status==="PENDING"&&<><button className="btn btn-primary" onClick={()=>void review(p.id,"APPROVED")}>Approve</button><button className="btn btn-danger" onClick={()=>void review(p.id,"REJECTED")}>Reject</button></>}</div>}
      </article>)}
    </section>
    <Modal open={Boolean(proofUrl)} title={proofTitle||"Payment receipt"} onCloseAction={closeProof}>{proofUrl&&<div className="p-4"><img className="max-h-[70vh] w-full rounded-lg object-contain" src={proofUrl} alt="Private payment receipt"/></div>}</Modal>
  </div>;
}
