tools/fonts - display fonts used to BUILD the title art (logos are rendered to PNG; no font file
ships with the game). All are SIL Open Font License 1.1 - the licence text sits next to each font.

  Jua-Regular.ttf       BM JUA by Woowa Brothers ("The BM JUA Project Authors"), 2018.
                        Rounded, chunky Hangul + Latin - the Korean logo letters.
                        Source: npm @fontsource/jua 5.3.0 (registry.npmjs.org), files
                        jua-korean-400-normal.woff2 (2,515 code points, every KS X 1001 syllable)
                        + jua-latin-400-normal.woff2, decompressed and merged with fontTools.
                        Licence: OFL-Jua.txt
  Fredoka-Bold.ttf      Fredoka 700 by Milena Brandao ("The Fredoka Project Authors"), 2016.
  Fredoka-SemiBold.ttf  Fredoka 600.  Round toy Latin - the English logo.
                        Source: npm @fontsource/fredoka 5.3.0, fredoka-latin-{700,600}-normal.woff2.
                        Licence: OFL-Fredoka.txt

Rebuild: python3 -m venv v && v/bin/pip install fonttools brotli && v/bin/python tools/fonts/make_fonts.py
(github raw downloads were blocked on the build machine; the npm registry works.)

OFL notes: the fonts may be used, embedded and redistributed freely, also commercially; they may not
be sold on their own; modified versions must not use the Reserved Font Names. Rendered pictures
(the logo PNGs) are not "Font Software" and carry no licence obligation; crediting the fonts in
the game's credits / store page is a nice courtesy:
  "Jua (c) The BM JUA Project Authors, Fredoka (c) The Fredoka Project Authors - SIL OFL 1.1".
