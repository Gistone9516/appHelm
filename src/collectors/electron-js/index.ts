// 수집원 electron-js: Electron 앱의 package.json과 fuse 상태 (IF-24)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Collector, CollectorContext, Evidence, Limitation, Target } from "../../core/types.ts";
import { openAsar, readAsarFile } from "../../decoders/asar.ts";

const ID = "electron-js";

interface PackageJson {
  name?: string;
  productName?: string;
  version?: string;
  main?: string;
  description?: string;
}

function readPackageJson(t: Target): { pkg?: PackageJson; error?: string } {
  const e = t.electron!;
  try {
    if (e.appDir) {
      const p = join(e.appDir, "package.json");
      if (existsSync(p)) return { pkg: JSON.parse(readFileSync(p, "utf8")) as PackageJson };
    }
    if (e.asar) {
      const buf = readAsarFile(openAsar(e.asar), "package.json");
      if (buf) return { pkg: JSON.parse(buf.toString("utf8")) as PackageJson };
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  return {};
}

export const electronJs: Collector = {
  id: ID,
  sideEffect: "none",
  appliesTo: (t: Target) => t.family === "electron" && !!t.electron,
  async collect(t: Target, ctx: CollectorContext) {
    const evidence: Evidence[] = [];
    const limitations: Limitation[] = [];
    const { pkg, error } = readPackageJson(t);
    if (error) limitations.push({ code: "E_PARSE", collector: ID, message: `package.json을 읽지 못했습니다: ${error}` });

    // fuse 상태(원격 디버깅 가능 여부 판단에 필요)
    const fuses = await ctx.rea.run("inspect-electron-fuses", [t.path]);
    let fuseInfo: unknown;
    if (fuses.ok) fuseInfo = (fuses.json as { normalized_result?: unknown }).normalized_result ?? fuses.json;
    else limitations.push({ ...fuses.limitation, collector: ID });

    evidence.push({
      id: `${ID}:electron-app`,
      source: ID,
      kind: "electron-app",
      payload: {
        package: pkg ?? null,
        asar: t.electron!.asar ?? null,
        appDir: t.electron!.appDir ?? null,
        fuses: fuseInfo ?? null,
      },
      confidence: 0.9,
      locator: { file: t.electron!.asar ?? t.electron!.appDir ?? t.path },
    });
    limitations.push({
      code: "E_NOT_APPLICABLE",
      collector: ID,
      message: "Electron 앱은 패키지 정보와 fuse만 읽었습니다. 화면 조작은 원격 디버깅 포트(CDP)가 필요합니다 (4차 실행 계층).",
      hint: pkg?.main ? `진입 스크립트: ${pkg.main}` : undefined,
    });
    return { evidence, limitations };
  },
};
