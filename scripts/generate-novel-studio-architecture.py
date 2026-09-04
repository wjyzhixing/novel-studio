from pathlib import Path
from html import escape

OUT = Path('docs/novel-studio-architecture.svg')
lines = []
def add(value): lines.append(value)
def text(x, y, value, size=16, fill='#e9e7df', weight='400', anchor='start'):
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>')
def box(x, y, w, h, title, subtitle='', fill='#171a22', stroke='#e6bd4f', accent='#f5d76e', dashed=False):
    dash = ' stroke-dasharray="8 6"' if dashed else ''
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="2"{dash}/>')
    add(f'<rect x="{x}" y="{y}" width="5" height="{h}" rx="2" fill="{accent}"/>')
    text(x + 18, y + 29, title, 16, '#fff7c7', '600')
    if subtitle: text(x + 18, y + 53, subtitle, 12, '#aaa99e')
def chip(x, y, label, color='#f5d76e'):
    width = max(64, len(label) * 12 + 24)
    add(f'<rect x="{x}" y="{y}" width="{width}" height="24" rx="12" fill="{color}" fill-opacity=".13" stroke="{color}" stroke-width="1"/>')
    text(x + width / 2, y + 17, label, 11, color, '600', 'middle')
def arrow(x1, y1, x2, y2, color='#f5d76e', label='', dashed=False, mid=None):
    dash = ' stroke-dasharray="7 5"' if dashed else ''
    add(f'<path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="{color}" stroke-width="2"{dash} marker-end="url(#{"arrow-yellow" if color == "#f5d76e" else "arrow-blue" if color == "#65a8ff" else "arrow-green" if color == "#68d391" else "arrow-purple"})"/>')
    if label:
        mx, my = mid or ((x1+x2)/2, (y1+y2)/2)
        w = max(70, len(label) * 11 + 16)
        add(f'<rect x="{mx-w/2}" y="{my-16}" width="{w}" height="22" rx="5" fill="#101219" opacity=".96"/>')
        text(mx, my, label, 11, color, '600', 'middle')
def layer(y, h, title, fill='#12151c'):
    add(f'<rect x="34" y="{y}" width="1532" height="{h}" rx="16" fill="{fill}" stroke="#30343e" stroke-width="1"/>')
    text(58, y + 27, title.upper(), 12, '#938d78', '600')
def cylinder(x, y, w, h, title, subtitle, color='#68d391'):
    add(f'<path d="M{x},{y+12} C{x},{y-4} {x+w},{y-4} {x+w},{y+12} L{x+w},{y+h-12} C{x+w},{y+h+4} {x},{y+h+4} {x},{y+h-12} Z" fill="#171a22" stroke="{color}" stroke-width="2"/>')
    add(f'<path d="M{x},{y+12} C{x},{y+28} {x+w},{y+28} {x+w},{y+12}" fill="none" stroke="{color}" stroke-width="1.4" opacity=".7"/>')
    add(f'<path d="M{x},{y+h-12} C{x},{y+h+4} {x+w},{y+h+4} {x+w},{y+h-12}" fill="none" stroke="{color}" stroke-width="1.4" opacity=".7"/>')
    text(x+w/2, y+48, title, 15, '#e9f9ed', '600', 'middle')
    text(x+w/2, y+70, subtitle, 11, '#91b79d', '400', 'middle')

add('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200" width="1600" height="1200">')
add('<style>text{font-family:"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif} .hand{stroke-linecap:round;stroke-linejoin:round}</style>')
add('<defs>')
for ident, color in [('arrow-yellow','#f5d76e'),('arrow-blue','#65a8ff'),('arrow-green','#68d391'),('arrow-purple','#c59cff')]:
    add(f'<marker id="{ident}" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="{color}"/></marker>')
add('</defs>')
add('<rect width="1600" height="1200" fill="#0b0e14"/>')
text(58, 58, 'Novel Studio', 30, '#fff7c7', '700')
text(58, 88, 'Electron + React + TypeScript · Local-first AI-native novel writing IDE', 14, '#aaa99e')
chip(1280, 38, 'SYSTEM ARCHITECTURE', '#f5d76e')

layer(112, 190, '01 · 用户与 Renderer 工作台')
box(70, 150, 210, 105, '作者 / OS', '文件选择 · 快捷键', '#171a22', '#f5d76e')
box(330, 140, 300, 125, 'React App Shell', 'App.tsx · Zustand AppStore', '#171a22', '#65a8ff', '#65a8ff')
box(680, 140, 260, 125, 'Writer Workbench', 'Sidebar · Editor · RightPanel', '#171a22', '#65a8ff', '#65a8ff')
box(990, 140, 250, 125, 'Story Bible', 'Entity · Timeline · Artifacts', '#171a22', '#c59cff', '#c59cff')
box(1290, 140, 220, 125, 'Studio Tools', 'Workflow · Graph · Image', '#171a22', '#c59cff', '#c59cff')
arrow(280, 200, 330, 200, '#f5d76e', '操作')
arrow(630, 200, 680, 200, '#65a8ff', '状态')
arrow(940, 200, 990, 200, '#c59cff', '导航')
arrow(1240, 200, 1290, 200, '#c59cff', '工作区')

layer(322, 135, '02 · 安全边界与 typed IPC')
box(100, 355, 330, 76, 'Preload contextBridge', '白名单 API · 无 Node 暴露', '#171a22', '#f5d76e')
box(510, 355, 330, 76, 'IPC Contract', 'shared/ipc.ts · shared schemas', '#171a22', '#f5d76e')
box(920, 355, 550, 76, 'Main IPC Router + Zod', '参数校验 · Result<T, AppError> · 敏感错误脱敏', '#171a22', '#f5d76e')
arrow(480, 393, 510, 393, '#f5d76e', 'invoke')
arrow(860, 393, 920, 393, '#f5d76e', 'validate')
arrow(795, 265, 270, 355, '#65a8ff', 'renderer calls', True, (545, 300))

layer(490, 320, '03 · Main Domain Services')
box(70, 535, 220, 100, 'ProjectService', '项目生命周期 · manifest', '#171a22', '#f5d76e')
box(330, 535, 220, 100, 'ChapterService', 'Markdown · autosave · FTS', '#171a22', '#65a8ff', '#65a8ff')
box(590, 535, 220, 100, 'StoryService', 'Entity · Timeline · Artifact', '#171a22', '#c59cff', '#c59cff')
box(850, 535, 220, 100, 'AiService', 'Provider · Secret · Chat', '#171a22', '#f5d76e')
box(1110, 535, 220, 100, 'Context / Memory', 'RAG · Canon · Embeddings', '#171a22', '#68d391', '#68d391')
box(1370, 535, 160, 100, 'Workflow Runtime', 'DAG · queue · retry', '#171a22', '#c59cff', '#c59cff')
for x in [180, 440, 700, 960, 1200, 1450]: arrow(x, 431, x, 535, '#f5d76e', 'route', True, (x+18, 490))
arrow(810, 585, 850, 585, '#f5d76e', 'AI')
arrow(1070, 585, 1110, 585, '#68d391', 'context')
arrow(1330, 585, 1370, 585, '#c59cff', 'run')

layer(680, 305, '04 · 内容源、索引、状态与外部 Provider')
box(70, 745, 250, 105, 'Open Format 内容源', 'chapters/*.md · story/*.yaml · assets/*', '#171a22', '#f5d76e')
cylinder(390, 735, 245, 125, 'SQLite', '索引 · 状态 · 审计 · jobs', '#68d391')
cylinder(705, 735, 245, 125, 'Embeddings SQLite', 'vector_json · model · hash', '#c59cff')
box(1020, 745, 235, 105, 'SecretStore', 'safeStorage · provider-secrets', '#171a22', '#f5d76e')
box(1325, 745, 205, 105, 'LLM / Image APIs', 'OpenAI · Anthropic · Gemini', '#171a22', '#65a8ff', '#65a8ff', True)
arrow(180, 635, 180, 745, '#f5d76e', 'read/write')
arrow(440, 635, 500, 735, '#65a8ff', 'index')
arrow(700, 635, 515, 735, '#c59cff', 'story data')
arrow(960, 635, 1135, 745, '#f5d76e', 'keys', True)
arrow(1200, 635, 825, 735, '#68d391', 'read/write')
arrow(1200, 635, 1425, 745, '#65a8ff', 'request')
arrow(1450, 635, 1425, 745, '#c59cff', 'execute')

layer(1008, 135, '05 · 关键闭环（跨层数据流）')
box(70, 1050, 250, 64, '写作与 AI Edit', 'Chapter → Context → AI → Diff', '#171a22', '#65a8ff', '#65a8ff')
box(390, 1050, 250, 64, '检索与 Embedding', 'Markdown hash → embed → cosine / FTS fallback', '#171a22', '#c59cff', '#c59cff')
box(710, 1050, 250, 64, 'Canon 人工审核', 'Memory Extract → Proposal → Apply / Revert', '#171a22', '#68d391', '#68d391')
box(1030, 1050, 250, 64, 'Workflow Runtime', 'DAG → parallel → pause/resume → retry', '#171a22', '#c59cff', '#c59cff')
box(1350, 1050, 180, 64, '可回退', 'Revision · Checkpoint', '#171a22', '#f5d76e')
arrow(320, 1082, 390, 1082, '#65a8ff', 'context')
arrow(640, 1082, 710, 1082, '#c59cff', 'proposal')
arrow(960, 1082, 1030, 1082, '#68d391', 'workflow')
arrow(1280, 1082, 1350, 1082, '#f5d76e', 'revision')

add('<g transform="translate(70 1150)">')
text(0, 0, '图例', 12, '#aaa99e', '600')
for i, (color, label) in enumerate([('#f5d76e','控制 / IPC'),('#65a8ff','主请求 / 文件'),('#68d391','Memory / 写入'),('#c59cff','Embedding / Workflow')]):
    x = 70 + i * 240
    add(f'<line x1="{x}" y1="-5" x2="{x+30}" y2="-5" stroke="{color}" stroke-width="2" marker-end="url(#{"arrow-yellow" if color == "#f5d76e" else "arrow-blue" if color == "#65a8ff" else "arrow-green" if color == "#68d391" else "arrow-purple"})"/>')
    text(x + 40, 0, label, 11, color)
add('</g>')
text(1530, 1178, 'v0.7 · generated from source audit', 10, '#6f716f', '400', 'end')
add('</svg>')

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text('\n'.join(lines), encoding='utf-8')
print(f'generated {OUT} ({len(lines)} SVG lines)')
