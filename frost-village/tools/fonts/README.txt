tools/fonts - display fonts used to BUILD the title art (logos are rendered to PNG; no font file
ships with the game). All are SIL Open Font License 1.1 - the licence text sits next to each font.

  Jua-Regular.ttf       BM JUA by Woowa Brothers ("The BM JUA Project Authors"), 2018.
                        Rounded, chunky Hangul + Latin - the Korean logo letters.
                        Source: npm @fontsource/jua 5.3.0 (registry.npmjs.org), files
                        jua-korean-400-normal.woff2 (2,515 code points, every KS X 1001 syllable)
                        + jua-latin-400-normal.woff2, decompressed and merged with fontTools.
                        Licence: OFL-Jua.txt
                        Coverage: 2,367 Hangul syllables = all 2,350 of KS X 1001 + 17. There is NO
                        full 11,172-syllable Jua: the Google Fonts Jua (all 86 numbered @fontsource
                        unicode-range slices merged) has the same 2,367, and the 2014 BM JUA TTF on npm
                        (@kfonts/bm-jua) maps all 11,172 but 8,805 of those glyphs are empty.
  Pretendard-ExtraBold.ttf  Pretendard 1.3.9 ExtraBold by Kil Hyung-jin ("with Reserved Font Name
                        Pretendard"), all 11,172 Hangul syllables. FALLBACK only: a syllable Jua does not
                        draw (e.g. 똠, 햏, 쌰, 큥) is built from this font so a rename never silently loses a
                        letter. Source: npm pretendard 1.3.9, dist/public/static/alternative/
                        Pretendard-ExtraBold.ttf (unmodified). Licence: OFL-Pretendard.txt
                        tools/blender/ttl_check_name.py reports which characters fall back.
  Fredoka-Bold.ttf      Fredoka 700 by Milena Brandao ("The Fredoka Project Authors"), 2016.
  Fredoka-SemiBold.ttf  Fredoka 600.  Round toy Latin - the English logo (600 for the big word:
                        its o / b / e counters stay open, 700 for the sign).
                        Source: npm @fontsource/fredoka 5.3.0, fredoka-latin-{700,600}-normal.woff2.
                        Licence: OFL-Fredoka.txt

Rebuild: python3 -m venv v && v/bin/pip install fonttools brotli && v/bin/python tools/fonts/make_fonts.py
(github raw downloads were blocked on the build machine; the npm registry works.)

OFL notes: the fonts may be used, embedded and redistributed freely, also commercially; they may not
be sold on their own; modified versions must not use the Reserved Font Names. Rendered pictures
(the logo PNGs) are not "Font Software" and carry no licence obligation; crediting the fonts in
the game's credits / store page is a nice courtesy:
  "Jua (c) The BM JUA Project Authors, Fredoka (c) The Fredoka Project Authors - SIL OFL 1.1"
  (+ "Pretendard (c) Kil Hyung-jin - SIL OFL 1.1" only if a fallback syllable is in the logo).
