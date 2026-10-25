// IF-7: MUI 파일 탐색. <exe 폴더>\<언어>\<파일명>.mui
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const LANG_DIR = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})+$/;

export function findMuiPaths(exePath: string, uiLang: string): string[] {
  const dir = dirname(exePath);
  const name = basename(exePath) + ".mui";
  const order = [uiLang, "en-US"];
  let others: string[] = [];
  try {
    others = readdirSync(dir)
      .filter((d) => LANG_DIR.test(d) && !order.some((o) => o.toLowerCase() === d.toLowerCase()))
      .sort();
  } catch {
    others = [];
  }
  const out: string[] = [];
  for (const lang of [...order, ...others]) {
    const p = join(dir, lang, name);
    try {
      if (existsSync(p) && statSync(p).isFile() && !out.includes(p)) out.push(p);
    } catch {
      // 권한 없는 폴더는 건너뛴다
    }
  }
  return out;
}
