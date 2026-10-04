"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type DialogTone = "success" | "error" | "info" | "warning";

type NoticeOptions = {
  title?: string;
  tone?: DialogTone;
  confirmLabel?: string;
};

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "warning" | "error";
};

type PromptOptions = {
  title?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type NoticeRequest = {
  kind: "notice";
  message: string;
  options: NoticeOptions;
  resolve: () => void;
};

type ConfirmRequest = {
  kind: "confirm";
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type PromptRequest = {
  kind: "prompt";
  message: string;
  options: PromptOptions;
  resolve: (value: string | null) => void;
};

type DialogRequest = NoticeRequest | ConfirmRequest | PromptRequest;

type FeedbackDialogApi = {
  notify: (message: string, options?: NoticeOptions) => Promise<void>;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
};

const FeedbackDialogContext = createContext<FeedbackDialogApi | null>(null);

const toneIcons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

export function FeedbackDialogProvider({ children }: { children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [promptValue, setPromptValue] = useState("");
  const current = queue[0];

  const enqueue = useCallback((request: DialogRequest) => {
    setQueue((items) => [...items, request]);
  }, []);

  const notify = useCallback<FeedbackDialogApi["notify"]>(
    (message, options = {}) =>
      new Promise<void>((resolve) => enqueue({ kind: "notice", message, options, resolve })),
    [enqueue]
  );

  const confirm = useCallback<FeedbackDialogApi["confirm"]>(
    (message, options = {}) =>
      new Promise<boolean>((resolve) => enqueue({ kind: "confirm", message, options, resolve })),
    [enqueue]
  );

  const prompt = useCallback<FeedbackDialogApi["prompt"]>(
    (message, options = {}) =>
      new Promise<string | null>((resolve) => enqueue({ kind: "prompt", message, options, resolve })),
    [enqueue]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !current) return;
    if (current.kind === "prompt") setPromptValue(current.options.initialValue ?? "");
    if (!dialog.open) dialog.showModal();
  }, [current]);

  const finish = useCallback(
    (accepted: boolean) => {
      if (!current) return;

      if (current.kind === "notice") current.resolve();
      if (current.kind === "confirm") current.resolve(accepted);
      if (current.kind === "prompt") current.resolve(accepted ? promptValue.trim() : null);

      dialogRef.current?.close();
      setQueue((items) => items.slice(1));
    },
    [current, promptValue]
  );

  const api = { notify, confirm, prompt };
  const tone: DialogTone = current?.kind === "notice"
    ? current.options.tone ?? "info"
    : current?.kind === "confirm"
      ? current.options.tone ?? "warning"
      : "info";
  const ToneIcon = toneIcons[tone];
  const title = current?.options.title ?? (
    current?.kind === "confirm" ? "Please confirm" :
    current?.kind === "prompt" ? "Enter details" :
    tone === "success" ? "Success" : tone === "error" ? "Something went wrong" : "Notice"
  );

  return (
    <FeedbackDialogContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        className="feedback-dialog m-auto bg-[var(--panel)] text-[var(--foreground)]"
        onCancel={(event) => {
          event.preventDefault();
          finish(false);
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) finish(false);
        }}
      >
        {current && (
          <form
            method="dialog"
            onSubmit={(event) => {
              event.preventDefault();
              finish(true);
            }}
          >
            <div className="feedback-dialog-body">
              <div className={`feedback-dialog-icon feedback-dialog-icon-${tone}`}>
                <ToneIcon size={25} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="muted mt-1.5 text-sm leading-6">{current.message}</p>
              </div>
            </div>

            {current.kind === "prompt" && (
              <div className="px-6 pb-2">
                <input
                  className="field"
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  placeholder={current.options.placeholder}
                  autoFocus
                  aria-label={title}
                />
              </div>
            )}

            <div className="feedback-dialog-actions">
              {current.kind !== "notice" && (
                <button type="button" className="btn btn-secondary" onClick={() => finish(false)}>
                  {current.options.cancelLabel ?? "Cancel"}
                </button>
              )}
              <button
                type="submit"
                className={`btn ${current.kind === "confirm" && tone === "error" ? "btn-danger-solid" : "btn-primary"}`}
                disabled={current.kind === "prompt" && !promptValue.trim()}
              >
                {current.options.confirmLabel ?? (current.kind === "notice" ? "OK" : "Confirm")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </FeedbackDialogContext.Provider>
  );
}

export function useFeedbackDialog() {
  const value = useContext(FeedbackDialogContext);
  if (!value) throw new Error("useFeedbackDialog must be used inside FeedbackDialogProvider");
  return value;
}
