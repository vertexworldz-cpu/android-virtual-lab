#!/usr/bin/env python3
"""Builds storage/assets/img/icons.svg (an SVG sprite) from lucide-static icons.

Usage: python3 tools/build_icons.py /path/to/lucide-static/icons
Scans PHP/JS sources for icon names so only the icons actually used are bundled.
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent / 'storage'
src = pathlib.Path(sys.argv[1])
names = set()
patterns = [
    re.compile(r"icon\(\s*'([a-z0-9-]+)'"),
    re.compile(r"=>\s*'([a-z0-9-]+)'"),           # PHP icon maps
    re.compile(r":\s*'([a-z0-9-]+)'"),            # JS icon maps
    re.compile(r"#(eye|eye-off)'"),
]
for f in list(root.rglob('*.php')) + list(root.rglob('*.js')):
    text = f.read_text(encoding='utf-8', errors='ignore')
    for p in patterns:
        names.update(p.findall(text))
    # Any quoted token that is a Lucide icon name (covers icon maps and helper args).
    names.update(re.findall(r"'([a-z][a-z0-9-]+)'", text))
names |= {'eye-off', 'cloud', 'check', 'rotate-ccw', 'search-x', 'pause', 'play', 'x', 'folder-open', 'files', 'clock', 'cloud-off'}
symbols = []
for name in sorted(names):
    path = src / f'{name}.svg'
    if not path.exists():
        continue
    svg = path.read_text()
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    inner = re.sub(r'\s+', ' ', inner).strip()
    symbols.append(f'<symbol id="{name}" viewBox="0 0 24 24">{inner}</symbol>')
out = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'
       '<!-- Icons: Lucide (ISC License) https://lucide.dev -->' + ''.join(symbols) + '</svg>\n')
(root / 'assets/img/icons.svg').write_text(out)
print(f'{len(symbols)} icons written')
