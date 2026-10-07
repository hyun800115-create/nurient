#!/usr/bin/env bash
# 이사 키트 만들기 — 서리마을(Frost Village)의 도구·에셋·문서를 새 프로젝트로 옮길 폴더(와 zip)를 만든다.
#
#   bash frost-village/handoff/make_kit.sh [대상폴더] [--zip]
#
#   대상폴더 기본값: frost-village/dist/settlers-starter-kit   (dist/ 는 git 에서 제외됨)
#   대상폴더가 이미 있으면(예: 새 저장소 루트) 지우지 않고 그 안에 덮어 복사한다 (.git 은 건드리지 않음).
#   --zip  : 대상폴더 옆에 <대상폴더>.zip 도 만든다.
#
# 결과 구조 (새 저장소 루트 기준):
#   CLAUDE.md, README.md, 지시서.md, 명령어모음.md, .gitignore
#   docs/handoff/        01~07 문서 (작업방식, 도구, 파이프라인, 교훈, 새 기획)
#   docs/reference/      전작 계약서·기획서·제작보고서·미리보기 일부
#   reference/frost-village/   전작 게임 전체 (index.html, lib, src, assets, tools) — 실행 가능한 원본
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FV="$(cd "$HERE/.." && pwd)"                       # frost-village/
OUT="${1:-$FV/dist/settlers-starter-kit}"
ZIP=0
for a in "$@"; do [ "$a" = "--zip" ] && ZIP=1; done
[ "${OUT}" = "--zip" ] && OUT="$FV/dist/settlers-starter-kit"

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
echo "[kit] 원본: $FV"
echo "[kit] 대상: $OUT"

# 1) 안내서
cp "$HERE/CLAUDE.md" "$OUT/CLAUDE.md"
cp "$HERE/README.md" "$OUT/README.md"
for f in 지시서.md 명령어모음.md; do [ -f "$HERE/$f" ] && cp "$HERE/$f" "$OUT/$f"; done
cat > "$OUT/.gitignore" <<'EOF'
node_modules/
__pycache__/
*.pyc
dist/
_cache/
.DS_Store
EOF

# 2) 문서
mkdir -p "$OUT/docs/handoff" "$OUT/docs/reference/previews/screens"
cp "$HERE"/docs/*.md "$OUT/docs/handoff/"
for f in CONTRACT.md CONTRACT_VILLAGERS.md 기획서.md 주민기획.md; do
  [ -f "$FV/docs/$f" ] && cp "$FV/docs/$f" "$OUT/docs/reference/"
done
[ -d "$FV/docs/build_reports" ] && cp -r "$FV/docs/build_reports" "$OUT/docs/reference/"
for f in char_lineup.png char_player.png vil_lineup.png vil_expressions.png props_scene.png props_items.png \
         props_all.png life_scene.png life_props_all.png emotes_sheet.png fx_sheet.png ui_sheet.png \
         ground_sheet.png ui_title_bg.png audio_waveforms.png; do
  [ -f "$FV/docs/previews/$f" ] && cp "$FV/docs/previews/$f" "$OUT/docs/reference/previews/"
done
for f in 01_title.jpg 05_carry_tower.jpg 07_customers_pay.jpg 13_forest_chop.jpg 20_overview.jpg 23_village_complete.jpg; do
  [ -f "$FV/docs/previews/screens/$f" ] && cp "$FV/docs/previews/screens/$f" "$OUT/docs/reference/previews/screens/"
done

# 3) 전작 게임 전체 (도구 + 에셋 + 코드) — 캐시·빌드 결과·node_modules 제외
REF="$OUT/reference/frost-village"
mkdir -p "$REF"
for f in index.html manifest.webmanifest .gitignore; do
  [ -f "$FV/$f" ] && cp "$FV/$f" "$REF/"
done
for d in lib src assets tools icons; do
  [ -d "$FV/$d" ] && cp -r "$FV/$d" "$REF/"
done
find "$REF" -type d \( -name node_modules -o -name __pycache__ -o -name _cache \) -prune -exec rm -rf {} +
find "$REF" -type f \( -name '*.pyc' -o -name '.DS_Store' \) -delete
# 전작 문서 경로를 도구들이 참조할 수 있도록 계약서 사본도 둔다
mkdir -p "$REF/docs"
for f in CONTRACT.md CONTRACT_VILLAGERS.md 기획서.md 주민기획.md; do
  [ -f "$FV/docs/$f" ] && cp "$FV/docs/$f" "$REF/docs/"
done
[ -d "$FV/docs/build_reports" ] && cp -r "$FV/docs/build_reports" "$REF/docs/"

# 4) 요약
FILES=$(find "$OUT" -type f -not -path '*/.git/*' | wc -l)
SIZE=$(du -sh --exclude=.git "$OUT" | cut -f1)
echo "[kit] 완료: 파일 $FILES 개, 크기 $SIZE"

if [ "$ZIP" = 1 ]; then
  Z="$OUT.zip"
  rm -f "$Z"
  (cd "$(dirname "$OUT")" && zip -qr "$Z" "$(basename "$OUT")" -x '*/.git/*')
  echo "[kit] zip: $Z ($(du -h "$Z" | cut -f1))"
fi
