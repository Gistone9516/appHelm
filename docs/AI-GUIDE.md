# AppHelm operation guide (for the AI)

You drive Windows programs through the `apphelm` MCP tools. This is the playbook. Read it before operating.

## Core model

1. **Map before you act.** Call `map_program(target)` to get an operation summary, then `get_operation_doc(section, query)` for detail. Never guess a command exists — confirm it in the map, the typelib, or the command catalog.
2. **Perception order — structured first, pixels last (IF-33).** Win32 / standard controls → UIA / MSAA accessibility tree → OCR on a screenshot (local, cheap) → vision on a screenshot (last resort). Text input and standard controls never need a screenshot. A screenshot is an image source for OCR/vision, not the default way to act.
3. **Verify every action by reading state back.** After a COM step, read `ActiveDocument.Name` / a property. After a GUI action, screenshot the window. Success reported by a tool is not proof the app changed.
4. **host** on any tool targets a remote node over Tailscale; omit it for this PC. A remote node must be running the agent (`apphelm serve` or `agent/apphelm-agent.ps1`) with the same token.

## Tools

- `list_hosts` — nodes you can target.
- `map_program(target, live?)` — build/refresh the map. `live:true` also reads the running window's UI elements (target must be open).
- `get_operation_doc(target, section, query?)` — sections: summary, operations, menus, dialogs, forms, live, automation, capabilities, version, limitations, runtime.
- `com_reference(lib, query)` — COM type-library signatures, parameter types, defaults, enum values. Use before any COM call to get exact member signatures and constant numbers. Build the library first with `apphelm typelib <file>`.
- `app_commands(progId, query)` — Office-family commands (ribbon idMso + legacy controls) by Korean/English name, with the ready-to-run invoke step. Build it first with `apphelm commands build`.
- `invoke_operation(action, host?, timeoutSec?)` — run one action immediately (no preview). Action kinds below. `shell` is intentionally not exposed.
- `trace_native(target, query?)` — Ghidra static trace of a native PE (slow; opt-in).

### invoke_operation action kinds

- `com` — `{kind, progId, attach?, steps:[{path, args?, setValue?, save?, each?}]}`. Path syntax: `ActiveDocument.Paragraphs(3).Range.Style`, `$name.member` (reuse a saved object), `each` to sweep a collection. One connection runs the steps in order; stops at the first failure.
- `uia` — `{kind, target, name?/automationId?/controlType?, pattern:Invoke|Toggle|Expand|Collapse|Select|Value, value?, nth?, list?}`. Use `pattern:Value` to set a text control (replaces its content).
- `window` — `{kind, target, mode:wm_command|keys, commandId?/keys?}`.
- `type` — `{kind, text, x?, y?, clear?(default true), enter?}`. Focus (optional click at x,y), **clear the field by default**, type Unicode (Korean-safe), optionally press Enter. Use this for custom inputs; `clear:true` is why text never gets appended to what was already there.
- `click` — `{kind, x, y, target?, button?, double?}`. For custom-drawn items with no structured handle: find the coordinate with a screenshot + OCR, then click.
- `screenshot` — `{kind, target?, region?, base64?}`. Saved to a file; the path is returned (never the raw image in your context). Read the file or OCR it.

## Recipes by app type

### A. App ships COM automation (Word, Excel, …)
1. `map_program("WINWORD.EXE")`; `apphelm typelib MSWORD.OLB` once.
2. `com_reference("Word", "Range.InsertAfter")`, `com_reference("Word", "wdStyleHeading1")` for signatures and constant values.
3. `invoke_operation` with `com` steps. Compose multi-step edits as one `steps` batch. Read back with a final step (e.g. `ActiveDocument.Paragraphs.Count`).
4. For ribbon commands by name: `app_commands("Word.Application", "표 삽입")` → run the returned `ExecuteMso(...)` path.

### B. App exposes UIA but no COM
1. `map_program(target, live:true)`; inspect `live` section for elements and patterns.
2. `invoke_operation` `uia` — `pattern:Invoke` to click, `pattern:Value` to set text.

### C. Uncooperative / custom-drawn app (e.g. KakaoTalk)
Its layout may be encrypted and its lists absent from UIA. Operate like a person:
1. `map_program(target, live:true)` for window structure; note standard inputs (a `RichEdit` with a Value pattern can be typed into directly).
2. To read custom content or find an item: `screenshot` the window, then OCR the PNG to get text + coordinates.
3. Navigate: `click` the coordinate of the item you found.
4. Input: `type` into the focused field (`clear:true`, `enter:true` to send). Prefer `uia` Value when the control exposes it.
5. Verify: `screenshot` again and confirm.

## Safety (non-negotiable)

- **Messaging/social apps: send only to yourself or an explicit test target** (e.g. KakaoTalk "나와의 채팅"). Confirm the target window shows the self/test chat by screenshot before sending.
- **Confirm before irreversible or outward actions** (sending, deleting, posting, paying). Reading and navigating are fine; committing an outward change needs the user's go-ahead unless they already authorized this exact action.
- **Never reverse-engineer an app's own encryption, inject code, or bypass a protection.** Operate only through the same surfaces a person uses.
- **Read back to confirm.** If you cannot verify the result, say so; do not report success you did not observe.
