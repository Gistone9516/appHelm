// Tailscale 노드 이름/IP 해석과 바인딩할 주소 찾기.
import { execFileSync } from "node:child_process";

const TAILSCALE = "C:\\Program Files\\Tailscale\\tailscale.exe";

export interface TailnetNode {
  ip: string;
  name: string;
  os: string;
  online: boolean;
}

function runTailscale(args: string[]): string {
  return execFileSync(TAILSCALE, args, { encoding: "utf8", windowsHide: true, timeout: 15000 });
}

/** `tailscale status` 파싱. 한 줄: <ip> <name> <user> <os> <status...> */
export function parseStatus(text: string): TailnetNode[] {
  const nodes: TailnetNode[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(100\.\d+\.\d+\.\d+)\s+(\S+)\s+\S+\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const rest = m[4] ?? "";
    nodes.push({ ip: m[1]!, name: m[2]!, os: m[3]!, online: !/offline/.test(rest) });
  }
  return nodes;
}

export function tailnetNodes(): TailnetNode[] {
  try {
    return parseStatus(runTailscale(["status"]));
  } catch {
    return [];
  }
}

/** 이름 또는 IP(끝 옥텟 ".125" 포함)를 Tailscale IP로 바꾼다. */
export function resolveHost(hostOrIp: string): { ip: string; node?: TailnetNode } | { error: string } {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostOrIp)) return { ip: hostOrIp };
  const nodes = tailnetNodes();
  if (/^\.\d+$/.test(hostOrIp)) {
    const match = nodes.filter((n) => n.ip.endsWith(hostOrIp));
    if (match.length === 1) return { ip: match[0]!.ip, node: match[0] };
    if (match.length > 1) return { error: `끝자리 ${hostOrIp}에 맞는 노드가 여럿입니다: ${match.map((n) => n.name).join(", ")}` };
    return { error: `끝자리 ${hostOrIp}에 맞는 노드가 없습니다.` };
  }
  const byName = nodes.find((n) => n.name.toLowerCase() === hostOrIp.toLowerCase());
  if (byName) return { ip: byName.ip, node: byName };
  return { error: `노드를 찾지 못했습니다: ${hostOrIp} (tailscale status에 ${nodes.map((n) => n.name).join(", ") || "노드 없음"})` };
}

/** 이 노드의 Tailscale IPv4 (없으면 null) */
export function ownTailscaleIp(): string | null {
  try {
    for (const line of runTailscale(["ip", "-4"]).split(/\r?\n/)) {
      const t = line.trim();
      if (/^100\.\d+\.\d+\.\d+$/.test(t)) return t;
    }
  } catch {
    // Tailscale 없음
  }
  return null;
}
