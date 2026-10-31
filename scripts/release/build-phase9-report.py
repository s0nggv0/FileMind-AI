"""Reproducible competition PDF and editable Markdown, no provider calls."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/competition'
FONT = Path('C:/Windows/Fonts/simsun.ttc')
pdfmetrics.registerFont(TTFont('Song', str(FONT), subfontIndex=0))
TEAL = colors.HexColor('#17685b')
INK = colors.HexColor('#24332f')
MUTED = colors.HexColor('#66716b')
PAPER = colors.HexColor('#fbfaf6')
STYLE = ParagraphStyle('body', fontName='Song', fontSize=12.2, leading=22, textColor=INK, wordWrap='CJK')
SMALL = ParagraphStyle('small', parent=STYLE, fontSize=10, leading=16)
HEAD = ParagraphStyle('head', parent=SMALL, textColor=colors.white)
TITLE = ParagraphStyle('title', parent=STYLE, fontSize=26, leading=35, textColor=TEAL)

# The application identity is independent of subsequent documentation commits.
BUILD = json.loads((ROOT / '.next/standalone/build-info.json').read_text())
DATA = json.loads((OUT / 'report-sections.json').read_text(encoding='utf-8'))
PAGES = [(x['title'], f"{i:02d} / {BUILD['BUILD_VERSION']} / {BUILD['BUILD_COMMIT'][:7]}", x['body'], [], x.get('note', '')) for i,x in enumerate(DATA,1)]
assert 1 <= len(PAGES) <= 30

def para(c, text, x, y, width, style=STYLE):
    p = Paragraph(escape(text), style)
    _, height = p.wrap(width, 1000)
    if y - height < 64:
        raise ValueError('Page overflow: ' + text[:70])
    p.drawOn(c, x, y-height)
    return y-height

OUT.mkdir(parents=True, exist_ok=True)
pdf = OUT / 'technical-report.pdf'
c = canvas.Canvas(str(pdf), pagesize=(595.28, 841.89), pageCompression=1)
c.setTitle('FileMind AI - Competition Technical Report ' + BUILD['BUILD_VERSION'])
c.setAuthor('FileMind AI / repository maintainer s0nggv0')
markdown = ['# FileMind AI 技术报告\n', f"> {len(PAGES)} 页；2026-10-31；{BUILD['BUILD_VERSION']}；应用提交 {BUILD['BUILD_COMMIT']}。\n"]
for index, (title, eyebrow, body, rows, note) in enumerate(PAGES, 1):
    c.setFillColor(PAPER); c.rect(0, 0, 595.28, 841.89, fill=1, stroke=0)
    c.setFont('Helvetica', 9); c.setFillColor(MUTED); c.drawString(48, 794, 'FILEMIND AI / COMPETITION TECHNICAL REPORT')
    c.setStrokeColor(TEAL); c.line(48, 778, 547, 778)
    y = para(c, eyebrow, 48, 750, 499, SMALL) - 13
    y = para(c, title, 48, y, 499, TITLE) - 26
    markdown += [f'\n## 第 {index} 页：{title}\n', f'*{eyebrow}*\n']
    for text in body:
        y = para(c, text, 48, y, 499) - 17
        markdown.append(text+'\n')
    if title == '系统架构':
        c.drawImage(str(OUT/'architecture.png'), 80, 78, width=435, height=335, preserveAspectRatio=True, anchor='c')
        markdown.append('![系统架构](architecture.png)\n')
    if rows:
        cells = [[Paragraph(escape(cell), HEAD if row_index == 0 else SMALL) for cell in row] for row_index,row in enumerate(rows)]
        table = Table(cells, colWidths=[160, 339], hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),TEAL),('TEXTCOLOR',(0,0),(-1,0),colors.white),('BACKGROUND',(0,1),(-1,-1),colors.HexColor('#f0f2eb')),('LINEBELOW',(0,0),(-1,0),1,TEAL),('LINEBELOW',(0,1),(-1,-1),.5,colors.HexColor('#d7ddd4')),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('VALIGN',(0,0),(-1,-1),'TOP')]))
        _, height = table.wrap(499, 1000)
        if y-height < 102: raise ValueError(f'Table overflow page {index}')
        table.drawOn(c,48,y-height); y-=height+18
        markdown += ['| '+ ' | '.join(row)+' |' for row in rows[:1]] + ['| --- | --- |'] + ['| '+' | '.join(row)+' |' for row in rows[1:]] + ['\n']
    if title != '系统架构':
        y = para(c, note, 48, y, 499, SMALL)
    shot = {'问题与展示顺序':'landing-citation-1440.png','架构约束与人审':'review-1920.png','检索、回答与原件':'citation-1920.png'}.get(title)
    if shot and (OUT/'screenshots/current'/shot).exists():
        c.drawImage(str(OUT/'screenshots/current'/shot),48,86,width=499,height=260,preserveAspectRatio=True,anchor='c')
        markdown.append(f'![当前界面](screenshots/current/{shot})\n')
    markdown.append(note+'\n')
    c.setFillColor(MUTED);c.setFont('Helvetica',8);c.drawString(48,36,f"{BUILD['BUILD_VERSION']} / {BUILD['BUILD_COMMIT'][:7]} / 2026-10-31");c.drawRightString(547,36,f'{index:02d} / {len(PAGES)}');c.showPage()
c.save()
(OUT/'technical-report.md').write_text('\n'.join(markdown).rstrip()+'\n',encoding='utf-8')
print(json.dumps({'pdf':str(pdf),'pages':len(PAGES),'sections':len(PAGES)},ensure_ascii=False))
