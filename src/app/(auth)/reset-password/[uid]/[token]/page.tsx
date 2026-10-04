"use client";
import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, jsonBody } from "@/lib/api";

export default function ResetPage() {
  const { uid, token } = useParams<{ uid: string; token: string }>(); const router = useRouter();
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const password = String(new FormData(e.currentTarget).get("password")); try { await api("/auth/password-reset/confirm/", { method: "POST", body: jsonBody({ uid, token, password }) }); router.push("/login"); } catch (x) { setError(x instanceof Error ? x.message : "Reset failed"); } }
  return <main className="min-h-screen grid place-items-center bg-emerald-950 p-5"><form onSubmit={submit} className="panel p-7 w-full max-w-md space-y-4"><h1 className="text-2xl font-bold">Choose a new password</h1><input className="field" type="password" name="password" minLength={8} required/>{error && <div className="error">{error}</div>}<button className="btn btn-primary w-full">Update password</button></form></main>;
}
