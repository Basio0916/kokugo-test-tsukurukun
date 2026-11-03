"""学年別漢字配当表と常用漢字表の JSON を作る。

使い方:
  pdftotext docs/sources/bunka/joyokanjihyo_20101130.pdf /tmp/joyo.txt
  python3 -I scripts/build_kanji_tables.py /tmp/joyo.txt src/catalog/kanji.json

配当表は告示の PDF に画像で載っているので、書き起こしたもの（scripts/haito.py）を使う。
常用漢字表は告示の PDF から取り出した文字の、本表の見出しの行から字種を集める。
学年ごとの字数、重複、字種の数（2136）、配当表の字がすべて常用漢字であることを確かめ、合わなければ書き出さずに止まる。
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from haito import COUNTS, HAITO  # noqa: E402

K = r'[一-鿿\U00020000-\U0002ffff]'
# 本表の見出し: 字、旧字体（括弧）、許容字体（角括弧）、ほかの旧字体（空白区切り）、音か訓
HEAD = re.compile(rf'^({K})(?:\({K}\))?(?:\[{K}\])?(?:\s+{K}+)*(?:\s+[ァ-ヶーぁ-ゖ]+)?$')
# 常用漢字表が本表で掲げる字体と、一般に使われる許容字体（付記の「許容字体」）
VARIANTS = {'𠮟': '叱', '塡': '填', '剝': '剥', '頰': '頬'}
# 「弁」は旧字体が三つ（辨・瓣・辯）あり、二つ目と三つ目が見出しと同じ形の行に出るので除く
NOT_HEADS = {'瓣', '辯'}


def joyo_chars(text: str) -> list[str]:
    text = unicodedata.normalize('NFKC', text)  # 康熙部首の字を通常の漢字に直す
    lines = text.splitlines()
    # 本表は「亜」から始まる。それより前の前書き・表の見方の行（字体の例など）は数えない
    start = next(i for i, line in enumerate(lines) if line.strip().startswith('亜(亞)'))
    chars: list[str] = []
    for line in lines[start:]:
        m = HEAD.match(line.strip())
        if m and m.group(1) not in chars and m.group(1) not in NOT_HEADS:
            chars.append(m.group(1))
    return chars


def main():
    joyo = joyo_chars(Path(sys.argv[1]).read_text(encoding='utf-8'))
    haito = {g: t.replace('\n', '') for g, t in HAITO.items()}
    problems = []
    if len(joyo) != 2136:
        problems.append(f'常用漢字の字種が {len(joyo)} 字（2136 字のはず）')
    for g, chars in haito.items():
        if len(chars) != COUNTS[g] or len(set(chars)) != len(chars):
            problems.append(f'{g}年の配当が {len(chars)} 字（{COUNTS[g]} 字のはず）または重複あり')
    all_haito = ''.join(haito.values())
    if len(set(all_haito)) != 1026:
        problems.append('配当表の字が学年をまたいで重複している')
    outside = [c for c in all_haito if c not in joyo]
    if outside:
        problems.append(f'常用漢字にない配当表の字: {"".join(outside)}')
    if problems:
        print(*problems, sep='\n')
        sys.exit(1)
    data = {
        'sources': [
            {'title': '小学校学習指導要領（平成29年告示） 第2章第1節 国語 別表 学年別漢字配当表',
             'url': 'https://www.mext.go.jp/content/20230120-mxt_kyoiku02-100002604_01.pdf', 'retrieved': '2026-11-03'},
            {'title': '常用漢字表（平成22年内閣告示第2号） 本表',
             'url': 'https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/pdf/joyokanjihyo_20101130.pdf', 'retrieved': '2026-11-03'},
        ],
        'haito': {str(g): chars for g, chars in haito.items()},
        'joyo': ''.join(joyo),
        'variants': VARIANTS,
    }
    Path(sys.argv[2]).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'配当表 {len(all_haito)} 字、常用漢字 {len(joyo)} 字を書き出した')


main()
