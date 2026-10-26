# Builds online/index.html: the claude.ai artifact version of the game
# (no doctype/html/head/body — the publisher adds the skeleton; game.js inlined).
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
js = (root / 'game.js').read_text()
head = re.search(r'<head>(.*)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
head = re.sub(r'<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*', '', head)
head = head.replace(':root {', ':root {\n    color-scheme: dark;', 1)
body = body.replace('<div id="wrap">', '<div id="wrap" dir="rtl" lang="ar">')
body = re.sub(r'<script src="game\.js[^"]*"></script>', lambda m: '<script>\n' + js + '\n</script>', body)
out = head.strip() + '\n' + body.strip() + '\n'
out = re.sub(r'\?v=\d+', '', out)
(root / 'online' / 'index.html').write_text(out)
print(len(out), 'bytes')
