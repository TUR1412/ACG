import { renderMarkdownToHtmlBlocks, stripInternalPlaceholdersFromHtml, translateViaGtx } from "../features/fulltext";

type FullTextLang = "zh" | "ja";

type FullTextWorkerRenderMessage = {
  type: "render";
  requestId: number;
  md: string;
  baseUrl: string;
};

type FullTextWorkerTranslateMessage = {
  type: "translate";
  requestId: number;
  text: string;
  target: FullTextLang;
  timeoutMs: number;
};

type FullTextWorkerInMessage = FullTextWorkerRenderMessage | FullTextWorkerTranslateMessage;

type FullTextWorkerRenderResultMessage = {
  type: "render_result";
  requestId: number;
  html: string;
  blocks?: string[];
};

type FullTextWorkerTranslateResultMessage = {
  type: "translate_result";
  requestId: number;
  translated: string;
};

type FullTextWorkerProgressMessage = {
  type: "progress";
  requestId: number;
  done: number;
  total: number;
};

type FullTextWorkerErrorMessage = {
  type: "error";
  requestId?: number;
  phase?: "render" | "translate";
  message: string;
};

type FullTextWorkerOutMessage =
  | FullTextWorkerRenderResultMessage
  | FullTextWorkerTranslateResultMessage
  | FullTextWorkerProgressMessage
  | FullTextWorkerErrorMessage;

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message || "error";
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function post(msg: FullTextWorkerOutMessage) {
  try {
    (self as unknown as { postMessage: (v: unknown) => void }).postMessage(msg);
  } catch {
    // ignore
  }
}

self.addEventListener("message", (ev: MessageEvent<FullTextWorkerInMessage>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "render") {
    try {
      const rawBlocks = renderMarkdownToHtmlBlocks(msg.md, msg.baseUrl);
      const blocks = rawBlocks.map(stripInternalPlaceholdersFromHtml).filter((x) => x.trim().length > 0);
      const html = blocks.join("\n");
      post({ type: "render_result", requestId: msg.requestId, html, blocks });
    } catch (err) {
      post({ type: "error", phase: "render", requestId: msg.requestId, message: stringifyError(err) });
    }
    return;
  }

  if (msg.type === "translate") {
    void (async () => {
      const translated = await translateViaGtx({
        text: msg.text,
        target: msg.target,
        timeoutMs: msg.timeoutMs,
        onProgress: (done, total) => {
          post({ type: "progress", requestId: msg.requestId, done, total });
        }
      });
      post({ type: "translate_result", requestId: msg.requestId, translated });
    })().catch((err) => {
      post({ type: "error", phase: "translate", requestId: msg.requestId, message: stringifyError(err) });
    });
  }
});
