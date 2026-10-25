// MFC 표준 명령 ID (afxres.h). 앱 리소스에 이름이 없을 때만 쓰는 보조 이름이다.
// 57600·57601·57603·57604·57607과 57632~57644는 그림판(mspaint) 단축키·메뉴 리소스와 교차 확인했다 (2026-10-25).
// 나머지는 기억에 근거한 값이라 신뢰도를 낮게 둔다.

export const MFC_VERIFIED: Record<number, string> = {
  57600: "새로 만들기",
  57601: "열기",
  57603: "저장",
  57604: "다른 이름으로 저장",
  57607: "인쇄",
  57632: "지우기",
  57634: "복사",
  57635: "잘라내기",
  57637: "붙여넣기",
  57642: "모두 선택",
  57643: "실행 취소",
  57644: "다시 실행",
};

export const MFC_RECALLED: Record<number, string> = {
  57602: "닫기",
  57605: "페이지 설정",
  57606: "인쇄 설정",
  57609: "인쇄 미리 보기",
  57636: "찾기",
  57641: "바꾸기",
  57664: "프로그램 정보",
  57665: "끝내기",
};

/** 리소스 문자열을 제목으로 바꾼다. MFC 형식 "설명\n짧은 이름"이면 짧은 이름을 쓴다. */
export function titleFromString(s: string): string {
  const parts = s.split("\n").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1]!;
  return parts[0] ?? s;
}

/** 명령 ID의 이름과 그 신뢰도. 모르면 null. */
export function knownCommandName(id: number): { title: string; confidence: number } | null {
  if (MFC_VERIFIED[id]) return { title: MFC_VERIFIED[id], confidence: 0.6 };
  if (MFC_RECALLED[id]) return { title: MFC_RECALLED[id], confidence: 0.4 };
  return null;
}
