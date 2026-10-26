// 전체 수집원 목록. main.ts는 import 시 process.exit를 실행하므로, MCP 등 다른 진입점이
// main.ts를 import하지 않고 이 목록만 가져가도록 분리한다 (현장 브리핑 2026-10-25).
import type { Collector } from "../core/types.ts";
import { peImports } from "../collectors/pe-imports/index.ts";
import { peResources } from "../collectors/pe-resources/index.ts";
import { comTypelib } from "../collectors/com-typelib/index.ts";
import { delphiDfm } from "../collectors/delphi-dfm/index.ts";
import { dotnet } from "../collectors/dotnet/index.ts";
import { electronJs } from "../collectors/electron-js/index.ts";
import { localPorts } from "../collectors/local-ports/index.ts";
import { qtResources } from "../collectors/qt-resources/index.ts";
import { registryVerbs } from "../collectors/registry-verbs/index.ts";
import { uiaSnapshot } from "../collectors/uia-snapshot/index.ts";

export const ALL_COLLECTORS: Collector[] = [peResources, peImports, registryVerbs, comTypelib, localPorts, dotnet, delphiDfm, qtResources, electronJs, uiaSnapshot];
