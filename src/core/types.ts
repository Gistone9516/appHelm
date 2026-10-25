// 공유 타입. 원본은 _인터페이스계약.md §2이며, 다르면 문서를 먼저 고친 뒤 여기를 맞춘다.

export type CollectorId = string;

export type TargetFamily = "native" | "delphi" | "dotnet" | "electron" | "web" | "java" | "unknown";

export interface Target {
  input: string;
  kind: "file" | "dir" | "pid";
  path: string;
  pid?: number;
  family: TargetFamily;
  familyEvidence: string[];
  pe?: PeInfo;
  muiPaths: string[];
}

export interface PeInfo {
  machine: number;
  is64: boolean;
  isDll: boolean;
  subsystem: number;
  isDotNet: boolean;
}

export type EvidenceKind =
  | "menu-item" | "dialog" | "dialog-control" | "accelerator" | "string" | "version"
  | "import-capability" | "com-method" | "cli-arg" | "shell-verb" | "url-protocol"
  | "ui-element" | "http-endpoint" | "dotnet-member" | "js-ipc" | "form-component";

export interface Locator {
  file: string;
  resource?: { type: number | string; name: number | string; lang?: number };
  offset?: number;
  registryKey?: string;
  uiaPath?: string;
  url?: string;
}

export type InvokeHint =
  | { via: "shortcut"; keys: string; context?: string }
  | { via: "menu"; path: string[]; commandId?: number }
  | { via: "wm_command"; id: number }
  | { via: "com"; progId: string; member: string; signature?: string }
  | { via: "cli"; argv: string[] }
  | { via: "uia"; automationId?: string; name?: string; pattern: string }
  | { via: "http"; method: string; url: string }
  | { via: "shell"; verb: string };

export type InvokeVia = InvokeHint["via"];

export interface Evidence {
  id: string;
  source: CollectorId;
  kind: EvidenceKind;
  payload: Record<string, unknown>;
  confidence: number;
  locator: Locator;
  invoke?: InvokeHint[];
}

export type SideEffect = "none" | "reads-registry" | "launches-target" | "attaches-running";

export type ErrorCode =
  | "E_NOT_APPLICABLE" | "E_OPT_IN_REQUIRED" | "E_TIMEOUT" | "E_ACCESS_DENIED"
  | "E_REA_UNAVAILABLE" | "E_NODE_VERSION" | "E_PS_FAILED"
  | "E_PARSE" | "E_UNSUPPORTED_FORMAT" | "E_MUI_NOT_FOUND" | "E_OUTPUT_TOO_LARGE";

export interface Limitation {
  code: ErrorCode;
  collector: CollectorId | "pipeline";
  message: string;
  hint?: string;
}

export interface CollectorResult {
  evidence: Evidence[];
  limitations: Limitation[];
}

export interface ReaRunner {
  run(command: string, args: string[]): Promise<{ ok: true; json: unknown } | { ok: false; limitation: Limitation }>;
}

export interface CollectorContext {
  allow: { live: boolean; launch: boolean };
  timeoutMs: number;
  workDir: string;
  lang: string;
  rea: ReaRunner;
  log: (msg: string) => void;
}

export interface Collector {
  id: CollectorId;
  sideEffect: SideEffect;
  appliesTo(t: Target): boolean;
  collect(t: Target, ctx: CollectorContext): Promise<CollectorResult>;
}

export interface Operation {
  title: string;
  group?: string;
  invoke: InvokeHint[];
  sources: CollectorId[];
  confidence: number;
}

export interface MenuNode {
  text: string;
  shortcutText?: string;
  commandId?: number;
  children?: MenuNode[];
  separator?: boolean;
}

export interface DialogDoc {
  name: number | string;
  title: string;
  controls: { id: number; className: string; text: string }[];
}

export interface OperationDoc {
  schemaVersion: 1;
  generatedAt: string;
  target: Target;
  summary: {
    family: TargetFamily;
    productName?: string;
    fileDescription?: string;
    howToOperate: InvokeVia[];
    counts: Record<string, number>;
  };
  operations: Operation[];
  ui: { menus: MenuNode[]; dialogs: DialogDoc[] };
  capabilities: string[];
  version: Record<string, string>;
  limitations: Limitation[];
  provenance: { collectorsRun: { id: CollectorId; ms: number; evidence: number }[] };
}
