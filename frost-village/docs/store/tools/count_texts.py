#!/usr/bin/env python3
"""Count the characters of the store texts in docs/store/listing_*.md against Google Play's limits.

    python3 frost-village/docs/store/tools/count_texts.py

Every ```text block counts under the heading above it. Play counts Unicode characters (a Hangul syllable = 1),
spaces and line breaks included. Exit 1 when a text is over its limit.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.abspath(os.path.join(HERE, '..'))
LIMITS = [  # (heading words, limit)
    (('앱 이름', 'App name'), 30),
    (('간단한 설명', 'Short description'), 80),
    (('자세한 설명', 'Full description'), 4000),
    (('출시 노트', 'Release notes'), 500),
]


def blocks(path):
    head = None
    out = []
    lines = open(path, encoding='utf-8').read().split('\n')
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith('## '):
            head = ln[3:].strip()
        if ln.strip() == '```text':
            j = i + 1
            body = []
            while j < len(lines) and lines[j].strip() != '```':
                body.append(lines[j])
                j += 1
            out.append((head, '\n'.join(body)))
            i = j
        i += 1
    return out


def main():
    bad = 0
    for name in ('listing_ko.md', 'listing_en.md'):
        p = os.path.join(STORE, name)
        if not os.path.exists(p):
            continue
        print(name)
        for head, body in blocks(p):
            lim = next((l for words, l in LIMITS if any(w in (head or '') for w in words)), None)
            n = len(body)
            flag = '' if lim is None or n <= lim else '  OVER'
            bad += 1 if flag else 0
            print('  %-58s %5d / %s%s' % ((head or '')[:58], n, lim if lim else '-', flag))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
