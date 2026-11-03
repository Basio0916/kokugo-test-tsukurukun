"""学習指導要領（平成29年告示）中学校国語の、学年ごとの指導事項と言語活動例の文言の JSON を作る。

使い方:
  pdftotext docs/sources/mext/chugakko-shidoyoryo-h29.pdf /tmp/kokuji.txt
  python3 -I scripts/extract_standards.py docs/sources/mitsumura-r7 /tmp/kokuji.txt src/catalog/standards.json

告示の PDF は欄外の見出しが本文に混ざり、そのままでは項目に分けにくい。
そこで、告示の文言を項目ごとに載せている光村図書の指導事項配列表（Word）の見出しから項目を取り、
一つずつ告示の本文に含まれることを確かめてから、告示の表記（読点は「，」、数字は半角）で書き出す。
告示に見つからない項目があれば、書き出さずに止まる。
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
KANA = 'アイウエオカキク'
CATEGORIES = ['(1)', '(2)', '(3)', 'A(1)', 'A(2)', 'B(1)', 'B(2)', 'C(1)', 'C(2)']
ZEN = str.maketrans('０１２３４５６７８９', '0123456789')
# 告示の PDF の欄外にある教科名などの見出し
MARGIN = {'総', '則', '国', '語', '社', '会', '数', '学', '理', '科', '音', '楽', '美', '術', '保健体育', '技術・家庭',
          '外国語', '特別活動', '幼稚園', '教育要領'}


def header_texts(path):
    """配列表の「知識及び技能」と「思考力、判断力、表現力等」の表の見出しの項目を、この順に返す。

    学年によって表の並びが違うので、表の見出しで見分ける。項目は「ア　」で始まるセルが並ぶ行にある。
    """
    root = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
    tables = root.find(W + 'body').findall(W + 'tbl')

    def text_of(el):
        return ''.join(t.text or '' for t in el.iter(W + 't')).strip()

    def is_item(text):
        return len(text) > 2 and text[0] in KANA and text[1] == '\u3000'

    texts = []
    for heading in ('〔知識及び技能〕', '〔思考力、判断力、表現力等〕'):
        tbl = next(t for t in tables if heading in text_of(t.findall(W + 'tr')[0]))
        row = next(tr for tr in tbl.findall(W + 'tr') if any(is_item(text_of(tc)) for tc in tr.findall(W + 'tc')))
        texts += [text_of(tc) for tc in row.findall(W + 'tc') if is_item(text_of(tc))]
    return texts


def coded(texts):
    """項目の記号を、カナが戻ったところで次の分類に進めて付ける。"""
    category, prev = 0, -1
    out = []
    for text in texts:
        kana = KANA.index(text[0])
        if kana <= prev:
            category += 1
        prev = kana
        out.append((CATEGORIES[category] + text[0], text[2:]))
    return out


def kokuji_body(path):
    lines = []
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line in MARGIN or line.isdigit():
            continue
        # ふりがな（「涵養」の「かん」など）は独立した行に出る
        if re.fullmatch(r'[ぁ-ん]{1,4}', line):
            continue
        lines.append(line)
    return re.sub(r'\s+', '', ''.join(lines)).translate(ZEN)


def fragments_in(text, body):
    """文言を、本文にあるひと続きの断片（できるだけ長く）に分ける。見つからない文字があれば None。

    PDF の文字の取り出しでは、ページの境目で行の順番が入れ替わることがあるので、
    一続きで見つからない項目は、断片に分けて一つずつ確かめる。
    """
    pieces, rest = [], text
    while rest:
        n = len(rest)
        while n > 0 and rest[:n] not in body:
            n -= 1
        if n < 3 and n != len(rest):
            return None
        pieces.append(rest[:n])
        rest = rest[n:]
    return pieces


def to_kokuji(text):
    return re.sub(r'\s+', '', text.translate(ZEN)).replace('、', '，')


def main():
    src, kokuji_txt, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    body = kokuji_body(kokuji_txt)
    items, missing = [], []
    for grade in (1, 2, 3):
        for code, text in coded(header_texts(src / f'{grade}nen-hairetsu.docx')):
            text = to_kokuji(text)
            pieces = fragments_in(text, body)
            if pieces is None or len(pieces) > 3:
                missing.append(f'{grade}年 {code} {text}')
            elif len(pieces) > 1:
                print(f'{grade}年 {code} は告示の本文に {len(pieces)} つの断片で見つかった:', ' / '.join(pieces))
            items.append({'grade': grade, 'code': code, 'text': text})
    if missing:
        print('告示の本文に見つからない項目:', *missing, sep='\n')
        sys.exit(1)
    data = {
        'source': {
            'title': '中学校学習指導要領（平成29年告示） 第2章第1節 国語',
            'url': 'https://www.mext.go.jp/content/20230120-mxt_kyoiku02-100002604_02.pdf',
            'retrieved': '2026-11-03',
        },
        'items': items,
    }
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for grade in (1, 2, 3):
        print(f'{grade}年:', ' '.join(i['code'] for i in items if i['grade'] == grade))


main()
