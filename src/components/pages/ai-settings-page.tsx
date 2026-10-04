"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import { api, jsonBody } from "@/lib/api";
import { ErrorMessage, Loading, LoadingModal, PageHeader } from "@/components/ui";
import { ModernSelect } from "@/components/modern-select";
import { useApiData } from "@/hooks/use-api-data";

type Config = {
  id: number;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
} | null;

type Provider = "OPENAI" | "GEMINI" | "GENERIC";

const PROVIDER_OPTIONS = [
  { value: "OPENAI", label: "OpenAI" },
  { value: "GEMINI", label: "Gemini" },
  { value: "GENERIC", label: "OpenAI-compatible" },
];

const MODEL_OPTIONS: Record<Exclude<Provider, "GENERIC">, { value: string; label: string }[]> = {
  OPENAI: [
    { value: "gpt-5-mini", label: "GPT-5 mini" },
    { value: "gpt-5-nano", label: "GPT-5 nano" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  ],
  GEMINI: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};

function normalizeProvider(value: string | null | undefined): Provider {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");

  if (normalized === "OPENAI") return "OPENAI";
  if (normalized === "GEMINI" || normalized === "GOOGLE_GEMINI") return "GEMINI";
  if (
    normalized === "GENERIC" ||
    normalized === "OPENAI_COMPATIBLE" ||
    normalized === "OPENAI_COMPAT"
  ) {
    return "GENERIC";
  }

  return "OPENAI";
}

function getDefaultModel(provider: Provider): string {
  return provider === "GENERIC" ? "" : MODEL_OPTIONS[provider][0].value;
}

function getProviderModelOptions(
  provider: Exclude<Provider, "GENERIC">,
  currentModel: string
) {
  const options = MODEL_OPTIONS[provider];
  if (!currentModel || options.some((option) => option.value === currentModel)) {
    return options;
  }

  return [{ value: currentModel, label: `Current: ${currentModel}` }, ...options];
}

export function AISettingsPage() {
  const current = useApiData<Config>("/ai/config/");

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<Provider>("OPENAI");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const hasConfig = Boolean(current.data);

  useEffect(() => {
    if (!current.data) {
      setProvider("OPENAI");
      setModel("");
      setBaseUrl("");
      setIsEditing(true);
      return;
    }

    const currentProvider = normalizeProvider(current.data.provider);
    setProvider(currentProvider);
    setModel(current.data.model);
    setBaseUrl(current.data.base_url || "");
    setIsEditing(false);
  }, [current.data]);

  function handleProviderChange(nextProvider: string) {
    const typedProvider = normalizeProvider(nextProvider);
    setProvider(typedProvider);
    setModel(getDefaultModel(typedProvider));
    if (typedProvider !== "GENERIC") {
      setBaseUrl("");
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = Object.fromEntries(new FormData(event.currentTarget));

    try {
      setIsSaving(true);
      await api("/ai/config/", {
        method: "POST",
        body: jsonBody(formData),
      });
      await current.reload();
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save configuration");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (!current.data) return;

    setProvider(normalizeProvider(current.data.provider));
    setModel(current.data.model);
    setBaseUrl(current.data.base_url || "");
    setError("");
    setIsEditing(false);
  }

  if (current.loading) {
    return <Loading variant="form" />;
  }

  return (
    <>
      <LoadingModal
        open={isSaving}
        title="Saving provider"
        message="Updating the active AI configuration."
      />

      <PageHeader
        title="AI Provider Settings"
        description="Configure one active encrypted provider credential."
      />

      <div className="grid gap-5 md:grid-cols-2">
        {/* Current Configuration Overview */}
        <section className="panel p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold">Current configuration</h2>
            {hasConfig && !isEditing && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsEditing(true)}
              >
                <Pencil size={16} /> Edit
              </button>
            )}
          </div>

          {current.error ? (
            <ErrorMessage message={current.error} />
          ) : current.data ? (
            <dl className="mt-4 space-y-2">
              <div>
                <dt className="muted">Provider</dt>
                <dd>{current.data.provider}</dd>
              </div>
              <div>
                <dt className="muted">Model</dt>
                <dd>{current.data.model}</dd>
              </div>
              <div>
                <dt className="muted">Base URL</dt>
                <dd>{current.data.base_url || "Default provider endpoint"}</dd>
              </div>
              <div>
                <dt className="muted">API key</dt>
                <dd>{current.data.api_key}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted mt-3">No active provider.</p>
          )}
        </section>

        {/* Configuration Edit/Add Form */}
        {isEditing && (
          <form className="panel space-y-3 p-5" onSubmit={handleSave}>
            <h2 className="text-lg font-bold">
              {hasConfig ? "Edit provider" : "Add provider"}
            </h2>

            <ModernSelect
              className="field"
              name="provider"
              aria-label="AI provider"
              options={PROVIDER_OPTIONS}
              value={provider}
              onValueChange={handleProviderChange}
            />

            {provider === "GENERIC" ? (
              <input
                className="field"
                name="model"
                placeholder="Model name"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                required
              />
            ) : (
              <ModernSelect
                className="field"
                name="model"
                aria-label="Model"
                options={getProviderModelOptions(provider, model)}
                value={model || getDefaultModel(provider)}
                onValueChange={setModel}
              />
            )}

            <input
              className="field"
              name="base_url"
              type="url"
              placeholder="Optional custom base URL"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              disabled={provider !== "GENERIC"}
              required={provider === "GENERIC"}
            />

            <input
              className="field"
              name="api_key"
              type="password"
              placeholder={hasConfig ? "New API key" : "API key"}
              required={!hasConfig}
            />

            {error && <ErrorMessage message={error} />}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
              >
                <Save size={16} /> {isSaving ? "Saving..." : "Save"}
              </button>

              {hasConfig && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancel}
                >
                  <X size={16} /> Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </>
  );
}