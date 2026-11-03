"""光村図書 令和7年度版「年間指導計画例」（Word）から、単元データの JSON を作る。

使い方:
  python3 -I scripts/extract_mitsumura_units.py docs/sources/mitsumura-r7 src/catalog/mitsumura-r7.json

取り出すのは事実情報（単元名・教材名・配当月・時数・指導事項と言語活動例の記号）だけで、
目標の文・学習活動・評価規準の文章は取り出さない。
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

SOURCE_PAGE = 'https://www.mitsumura-tosho.co.jp/kyokasho/c-kokugo/keikaku'
SOURCE_URLS = {
    1: 'https://www.mitsumura-tosho.co.jp/download_file/view/4835ceeb-8ae6-4296-b552-e1fd115e8d52/609',
    2: 'https://www.mitsumura-tosho.co.jp/download_file/view/db7a8384-2887-4d6a-b3b8-bb440e771317/609',
    3: 'https://www.mitsumura-tosho.co.jp/download_file/view/e20bc4fb-3c7f-4778-b279-8013c15524e3/609',
}
RETRIEVED = '2026-11-03'

ZEN = str.maketrans('０１２３４５６７８９', '0123456789')
# 「　８時間（読⑥書②）」「（２時間）」
HOURS = re.compile(r'^（?([0-9]+)時間(?:（(.+)）)?）?$')
# 「（知・技(1)エ）」「（思・判・表C(1)イ）」「（知・技1年(1)エ、2年(1)オ）」「（2年思・判・表B(2)ウ）」。
# 資料には外側の括弧が半角の行もある
CODE = re.compile(r'(?:([123])年)?([ABC]?\([123]\)[ア-カ])')
CODE_GROUP = re.compile(r'(?:([123])年)?(?:知・技|思・判・表)(' + CODE.pattern + r'(?:、' + CODE.pattern + r')*)')


def paragraphs(tc):
    out = []
    for p in tc.iter(W + 'p'):
        text = ''.join(t.text or '' for t in p.iter(W + 't')).strip()
        if text:
            out.append(text)
    return out


def rows(path):
    root = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml'))
    for tbl in root.find(W + 'body').findall(W + 'tbl'):
        for tr in tbl.findall(W + 'tr'):
            yield [paragraphs(tc) for tc in tr.findall(W + 'tc')]


def material_lines(lines):
    """教材欄の行を、教材名ごとの行にまとめる。

    資料では一つの教材名が複数の行に折り返されていることがある:
    「[聞く]」だけの行は次の行の頭に付き、「――「徒然草」から」は前の行の副題、「…／」で終わる行は次の行に続く。
    """
    out = []
    joins_next = False
    for line in (re.sub(r'\s+', '　', x) for x in lines):
        if out and (joins_next or line.startswith('――')):
            out[-1] += line
        else:
            out.append(line)
        joins_next = bool(re.fullmatch(r'[\[［][^\]］]+[\]］]', line)) or line.endswith('／')
    return out


def codes_of(goal_lines, grade):
    standards, activities, earlier = [], [], []
    goals = ''.join(goal_lines).replace('（', '(').replace('）', ')')
    for match in CODE_GROUP.finditer(goals):
        for of_grade, code in CODE.findall(match.group(2)):
            of_grade = of_grade or match.group(1)
            if of_grade and int(of_grade) != grade:
                item = {'grade': int(of_grade), 'code': code}
                if item not in earlier:
                    earlier.append(item)
            elif code[1:3] == '(2' and code[0] in 'ABC':
                if code not in activities:
                    activities.append(code)
            elif code not in standards:
                standards.append(code)
    return standards, activities, earlier


def is_material(line):
    return not re.match(r'[◎★・◇◆]', line) and not CODE_GROUP.search(line.replace('（', '(').replace('）', ')')) \
        and '学びに向かう力' not in line


def parse_groups(month_cell, main_cell, grade):
    """一つの行の教材欄を、教材のまとまりに分ける。

    ふつうは一行が一つのまとまりだが、教材ごとに時数が付いて一つの欄に並ぶ行もある（三年の「温かいスープ」など）。
    時数の行で区切り、時数の直前に続く目標でない行を、そのまとまりの教材名とする。
    """
    month = int(''.join(month_cell).translate(ZEN).removesuffix('月'))
    lines = [line.translate(ZEN) for line in main_cell]
    hours_at = [i for i, line in enumerate(lines) if HOURS.match(line)]
    # 時数のない行（季節のしおり）は授業の単元ではなく、テストの範囲にもならないので入れない
    groups = []
    for k, h in enumerate(hours_at):
        first = 0
        if k > 0:
            first = h
            while first > hours_at[k - 1] + 1 and is_material(lines[first - 1]):
                first -= 1
        last = len(lines)
        if k + 1 < len(hours_at):
            last = hours_at[k + 1]
            while last > h + 1 and is_material(lines[last - 1]):
                last -= 1
        hours, breakdown = HOURS.match(lines[h]).groups()
        standards, activities, earlier = codes_of(lines[h + 1:last], grade)
        group = {'month': month, 'materials': material_lines(main_cell[first:h]), 'hours': int(hours)}
        if breakdown:
            group['breakdown'] = breakdown
        group['standards'] = standards
        group['activities'] = activities
        if earlier:
            group['earlierGradeCodes'] = earlier
        groups.append(group)
    return groups


def parse_grade(path, grade):
    units = []
    for cells in rows(path):
        if len(cells) == 1:
            units.append({'title': ''.join(cells[0]), 'groups': []})
            continue
        groups = parse_groups(cells[0], cells[1], grade)
        if not groups:
            continue
        if not units:
            # 最初の単元の見出しより前に置かれた教材
            units.append({'title': None, 'groups': []})
        units[-1]['groups'].extend(groups)
    return [u for u in units if u['groups']]


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    catalog = {
        'textbook': '光村図書 令和7年度版 国語（中学校）',
        'sources': [
            {'title': f'年間指導計画例（{g}年）', 'url': SOURCE_URLS[g], 'retrieved': RETRIEVED} for g in (1, 2, 3)
        ] + [{'title': '年間指導計画・評価計画資料（掲載ページ）', 'url': SOURCE_PAGE, 'retrieved': RETRIEVED}],
        'grades': [{'grade': g, 'units': parse_grade(src / f'{g}nen-keikaku.docx', g)} for g in (1, 2, 3)],
    }
    out.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for g in catalog['grades']:
        groups = [x for u in g['units'] for x in u['groups']]
        print(f"{g['grade']}年: 単元 {len(g['units'])}、まとまり {len(groups)}、教材名 {sum(len(x['materials']) for x in groups)}")


main()
