"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, ChevronDown, ClipboardCheck, FileText, GraduationCap, LoaderCircle, Search, ShieldCheck, UserRound, Users, WalletCards, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ModernSelect, type ModernSelectOption } from "@/components/modern-select";
import { Empty, ErrorMessage, Loading, PageHeader } from "@/components/ui";
import { api, unwrap } from "@/lib/api";
import type { Category, Role } from "@/lib/types";
import { useApiData } from "@/hooks/use-api-data";

type SearchItem = { id:number; kind:string; title:string; subtitle:string; description:string; badges:string[]; href:string; action:string };
type SearchGroup = { count:number; page:number; page_size:number; pages:number; results:SearchItem[] };
type SearchResponse = { query:string; role:Role; tab:string; available_tabs:string[]; groups:Record<string,SearchGroup> };

const labels:Record<string,string> = { all:"All",courses:"Courses",materials:"Materials",quizzes:"Quizzes",enrollments:"My Learning",learning_paths:"Learning Paths",students:"Students",users:"Users",payments:"Payments",certificates:"Certificates",applications:"Instructor Applications" };
const icons = { courses:BookOpen,materials:FileText,quizzes:ClipboardCheck,enrollments:GraduationCap,learning_paths:GraduationCap,students:Users,users:UserRound,payments:WalletCards,certificates:ShieldCheck,applications:ClipboardCheck };
const copy:Record<Role,{title:string;description:string;placeholder:string}> = {
  STUDENT:{title:"Search and Discovery",description:"Find courses, your learning materials, quizzes, and personalized learning paths.",placeholder:"Search courses, materials, quizzes, and topics..."},
  INSTRUCTOR:{title:"Instructor Search",description:"Find your owned courses, learning materials, quizzes, and enrolled students.",placeholder:"Search your courses, materials, quizzes, or enrolled students..."},
  ADMIN:{title:"Administration Search",description:"Find learning content, people, payments, certificates, enrollments, and applications.",placeholder:"Search by title, code, email, transaction, certificate, or reference..."},
};
const shortcuts:Record<Role,string[]> = {
  STUDENT:["My enrolled courses","Available quizzes","Learning recommendations"],
  INSTRUCTOR:["My draft courses","Enrolled students","Published quizzes"],
  ADMIN:["Pending payments","Instructor applications","Certificates"],
};

function Highlight({text,query}:{text:string;query:string}) {
  if(!query.trim()) return <>{text}</>;
  const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return <>{text.split(new RegExp(`(${escaped})`,"ig")).map((part,index)=>part.toLowerCase()===query.toLowerCase()?<mark className="rounded bg-[var(--warning-soft)] px-0.5 text-inherit" key={index}>{part}</mark>:part)}</>;
}

function ResultCard({item,query}:{item:SearchItem;query:string}) {
  const Icon=icons[item.kind as keyof typeof icons]||Search;
  return <article className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 flex-1"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"><Icon size={19} aria-hidden="true"/></div><div className="min-w-0"><h3 className="font-bold"><Highlight text={item.title} query={query}/></h3><p className="muted mt-0.5 text-sm"><Highlight text={item.subtitle||labels[item.kind]} query={query}/></p></div></div>{item.description&&<p className="muted mt-3 line-clamp-2 text-sm"><Highlight text={item.description} query={query}/></p>}<div className="mt-3 flex flex-wrap gap-2">{item.badges.filter(Boolean).map(badge=><span className="badge" key={badge}>{badge}</span>)}</div></div><Link href={item.href} className="btn btn-primary shrink-0"><ArrowRight size={16} aria-hidden="true"/>{item.action}</Link></article>;
}

function Group({name,group,query,open,onToggle}:{name:string;group:SearchGroup;query:string;open:boolean;onToggle:()=>void}) {
  const panelId=`search-group-${name}`;
  return <section className="space-y-3"><div className="panel p-3"><button className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-[var(--background)]" onClick={onToggle} aria-expanded={open} aria-controls={panelId}><ChevronDown className={`shrink-0 transition-transform ${open?"":"-rotate-90"}`} size={18} aria-hidden="true"/><h2 className="text-lg font-bold">{labels[name]||name}</h2><span className="badge">{group.count}</span><span className="muted ml-auto hidden text-xs sm:inline">{open?"Collapse":"Expand"}</span></button></div>{open&&<div className="space-y-3" id={panelId}>{group.results.length?group.results.map(item=><ResultCard item={item} query={query} key={`${name}-${item.id}`}/>):<Empty message={`No ${labels[name]?.toLowerCase()||"results"} found.`}/>}</div>}</section>;
}

export function SearchPage() {
  const {user,loading:authLoading}=useAuth();
  const router=useRouter(); const initial=useSearchParams();
  const categories=useApiData<Category[]|{results:Category[]}>(user?"/categories/":null);
  const [query,setQuery]=useState(initial.get("q")||""); const [tab,setTab]=useState(initial.get("tab")||"all"); const [page,setPage]=useState(Math.max(1,Number(initial.get("page"))||1));
  const [category,setCategory]=useState(initial.get("category")||""); const [level,setLevel]=useState(initial.get("level")||""); const [courseType,setCourseType]=useState(initial.get("course_type")||""); const [status,setStatus]=useState(initial.get("status")||""); const [materialType,setMaterialType]=useState(initial.get("material_type")||"");
  const [userRole,setUserRole]=useState(initial.get("user_role")||""); const [paymentStatus,setPaymentStatus]=useState(initial.get("payment_status")||""); const [applicationStatus,setApplicationStatus]=useState(initial.get("application_status")||"");
  const [data,setData]=useState<SearchResponse|null>(null); const [error,setError]=useState(""); const [searching,setSearching]=useState(false); const requestId=useRef(0);
  const [refresh,setRefresh]=useState(0); const [recent,setRecent]=useState<string[]>([]); const lastRefresh=useRef(0);
  const [openGroups,setOpenGroups]=useState<Record<string,boolean>>({});
  const params=useMemo(()=>{const value=new URLSearchParams({q:query,tab,page:String(page)});if(category)value.set("category",category);if(level)value.set("level",level);if(courseType)value.set("course_type",courseType);if(status)value.set("status",status);if(materialType)value.set("material_type",materialType);if(userRole)value.set("user_role",userRole);if(paymentStatus)value.set("payment_status",paymentStatus);if(applicationStatus)value.set("application_status",applicationStatus);return value},[applicationStatus,category,courseType,level,materialType,page,paymentStatus,query,status,tab,userRole]);

  useEffect(()=>{if(user)setRecent(JSON.parse(localStorage.getItem(`pylearn-recent-searches-${user.id}`)||"[]") as string[])},[user]);
  useEffect(()=>{if(!user)return;const id=++requestId.current;const immediate=refresh!==lastRefresh.current;lastRefresh.current=refresh;const timer=window.setTimeout(async()=>{setSearching(true);setError("");router.replace(`/search?${params}`,{scroll:false});try{const response=await api<SearchResponse>(`/search/?${params}`);if(id===requestId.current)setData(response);if(query.trim()){const key=`pylearn-recent-searches-${user.id}`;const old=JSON.parse(localStorage.getItem(key)||"[]") as string[];const next=[query.trim(),...old.filter(item=>item!==query.trim())].slice(0,6);localStorage.setItem(key,JSON.stringify(next));setRecent(next)}}catch(reason){if(id===requestId.current)setError(reason instanceof Error?reason.message:"Search failed.")}finally{if(id===requestId.current)setSearching(false)}},immediate?0:350);return()=>window.clearTimeout(timer)},[params,query,refresh,router,user]);

  if(authLoading||!user)return <Loading variant="page"/>;
  const roleCopy=copy[user.role]; const tabs=data?.available_tabs||["all"]; const current=data?.groups[tab];
  const categoryOptions:ModernSelectOption[]=[{value:"",label:"All categories"},...unwrap(categories.data||[]).map(item=>({value:item.id,label:item.name}))];
  const filterCount=[category,level,courseType,status,materialType,userRole,paymentStatus,applicationStatus].filter(Boolean).length;
  const chooseTab=(value:string)=>{setTab(value);setPage(1)};
  const chooseShortcut=(value:string)=>{
    if(user.role==="ADMIN"){
      if(value==="Pending payments"){setQuery("");setTab("payments");setPaymentStatus("PENDING");setPage(1);return}
      if(value==="Instructor applications"){setQuery("");setTab("applications");setPage(1);return}
      if(value==="Certificates"||value==="Certificate verification"){setQuery("");setTab("certificates");setPage(1);return}
    }
    if(user.role==="STUDENT"){
      if(value==="My enrolled courses"){setQuery("");setTab("enrollments");setPage(1);return}
      if(value==="Available quizzes"){setQuery("");setTab("quizzes");setPage(1);return}
      if(value==="Learning recommendations"){setQuery("");setTab("learning_paths");setPage(1);return}
    }
    if(user.role==="INSTRUCTOR"){
      if(value==="My draft courses"){setQuery("");setTab("courses");setStatus("DRAFT");setPage(1);return}
      if(value==="Enrolled students"){setQuery("");setTab("students");setPage(1);return}
      if(value==="Published quizzes"){setQuery("");setTab("quizzes");setPage(1);return}
    }
    setQuery(value);setPage(1);
  };
  const clearFilters=()=>{setCategory("");setLevel("");setCourseType("");setStatus("");setMaterialType("");setUserRole("");setPaymentStatus("");setApplicationStatus("");setPage(1)};
  const groupNames=data?Object.keys(data.groups):[];
  const setAllGroups=(open:boolean)=>setOpenGroups(Object.fromEntries(groupNames.map(name=>[name,open])) as Record<string,boolean>);
  const toggleGroup=(name:string)=>setOpenGroups(current=>({...current,[name]:!(current[name]??true)}));
  return <div className="space-y-6" aria-busy={searching}><PageHeader title={roleCopy.title} description={roleCopy.description}/>{user.role==="ADMIN"&&<div className="panel flex items-start gap-3 border-[var(--primary)] p-4 text-sm"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--primary)]" size={18} aria-hidden="true"/><p><strong>Operational search:</strong> Credentials, tokens, payment proofs, and private files are excluded.</p></div>}
    <section className="panel space-y-4 p-5"><div className="flex flex-col gap-3 md:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={19} aria-hidden="true"/><input className="field !pl-12" value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} placeholder={roleCopy.placeholder} aria-label="Search portal" autoFocus/>{query&&<button className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" onClick={()=>setQuery("")} aria-label="Clear search"><X size={18} aria-hidden="true"/></button>}</div><button className="btn btn-primary px-7" onClick={()=>{setPage(1);setRefresh(value=>value+1)}} disabled={searching}>{searching?<LoaderCircle className="animate-spin" size={17} aria-hidden="true"/>:<Search size={17} aria-hidden="true"/>}Search</button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><ModernSelect aria-label="Category" value={category} onValueChange={value=>{setCategory(value);setPage(1)}} options={categoryOptions}/>{user.role==="STUDENT"&&<><ModernSelect aria-label="Level" value={level} onValueChange={value=>{setLevel(value);setPage(1)}} options={[{value:"",label:"All levels"},{value:"BEGINNER",label:"Beginner"},{value:"INTERMEDIATE",label:"Intermediate"},{value:"ADVANCED",label:"Advanced"}]}/><ModernSelect aria-label="Price type" value={courseType} onValueChange={value=>{setCourseType(value);setPage(1)}} options={[{value:"",label:"All pricing"},{value:"FREE",label:"Free"},{value:"PAID",label:"Paid"}]}/></>}{user.role!=="STUDENT"&&<ModernSelect aria-label="Course status" value={status} onValueChange={value=>{setStatus(value);setPage(1)}} options={[{value:"",label:"All course statuses"},{value:"PUBLISHED",label:"Published"},{value:"DRAFT",label:"Draft"},{value:"ARCHIVED",label:"Archived"}]}/>}<ModernSelect aria-label="Material type" value={materialType} onValueChange={value=>{setMaterialType(value);setPage(1)}} options={[{value:"",label:"All material types"},{value:"PDF",label:"PDF"},{value:"VIDEO",label:"Video"},{value:"NOTE",label:"Note"}]}/>{user.role==="ADMIN"&&<><ModernSelect aria-label="User role" value={userRole} onValueChange={value=>{setUserRole(value);setPage(1)}} options={[{value:"",label:"All user roles"},{value:"STUDENT",label:"Students"},{value:"INSTRUCTOR",label:"Instructors"},{value:"ADMIN",label:"Administrators"}]}/><ModernSelect aria-label="Payment status" value={paymentStatus} onValueChange={value=>{setPaymentStatus(value);setPage(1)}} options={[{value:"",label:"All payment statuses"},{value:"PENDING",label:"Pending"},{value:"APPROVED",label:"Approved"},{value:"REJECTED",label:"Rejected"}]}/><ModernSelect aria-label="Application status" value={applicationStatus} onValueChange={value=>{setApplicationStatus(value);setPage(1)}} options={[{value:"",label:"All application statuses"},{value:"PENDING",label:"Pending"},{value:"APPROVED",label:"Approved"},{value:"REJECTED",label:"Rejected"}]}/></>}</div>{filterCount>0&&<button className="btn btn-secondary" onClick={clearFilters}><X size={15} aria-hidden="true"/>Clear {filterCount} filters</button>}</section>
    {!query.trim()&&<section className="grid gap-4 lg:grid-cols-2"><div className="panel p-5"><h2 className="font-bold">Recent searches</h2><div className="mt-3 flex flex-wrap gap-2">{recent.length?recent.map(item=><button className="btn btn-secondary" onClick={()=>setQuery(item)} key={item}><Search size={14} aria-hidden="true"/>{item}</button>):<p className="muted text-sm">Your recent searches will appear here.</p>}</div></div><div className="panel p-5"><h2 className="font-bold">Quick searches</h2><div className="mt-3 flex flex-wrap gap-2">{shortcuts[user.role].map(item=><button className="btn btn-secondary" onClick={()=>chooseShortcut(item)} key={item}><ArrowRight size={14} aria-hidden="true"/>{item}</button>)}</div></div></section>}
    <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-2" role="tablist" aria-label="Search result types">{tabs.map(name=><button role="tab" aria-selected={tab===name} className={`btn whitespace-nowrap ${tab===name?"btn-primary":"btn-secondary"}`} onClick={()=>chooseTab(name)} key={name}>{labels[name]||name}{data?.groups[name]&&<span className="badge">{data.groups[name].count}</span>}</button>)}</div>
    {data&&groupNames.length>0&&<div className="flex flex-wrap justify-end gap-2"><button className="btn btn-secondary" onClick={()=>setAllGroups(false)}><ChevronDown className="-rotate-90" size={15} aria-hidden="true"/>Collapse all</button><button className="btn btn-secondary" onClick={()=>setAllGroups(true)}><ChevronDown size={15} aria-hidden="true"/>Expand all</button></div>}
    {error?<ErrorMessage message={error}/>:!data?<Loading variant="list"/>:<div className={`space-y-7 ${searching?"opacity-60":""}`}>{tab==="all"?Object.entries(data.groups).map(([name,group])=><Group name={name} group={group} query={query} open={openGroups[name]??true} onToggle={()=>toggleGroup(name)} key={name}/>):current?<Group name={tab} group={current} query={query} open={openGroups[tab]??true} onToggle={()=>toggleGroup(tab)}/>:<Empty message="No results are available for this section."/>}</div>}
    {tab!=="all"&&current&&current.pages>1&&<nav className="flex items-center justify-between gap-3" aria-label="Search result pages"><span className="muted text-sm">Page {current.page} of {current.pages}</span><div className="flex gap-2"><button className="btn btn-secondary" disabled={page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}><ArrowRight className="rotate-180" size={15} aria-hidden="true"/>Previous</button><button className="btn btn-secondary" disabled={page>=current.pages} onClick={()=>setPage(value=>value+1)}><ArrowRight size={15} aria-hidden="true"/>Next</button></div></nav>}
  </div>;
}
