#!/usr/bin/env python3
"""Give BOLW Core a new version number everywhere it lives, and list every app file for offline use.
Run from the repository root:  python3 tools/core-version.py 1.0.1
It rewrites: docs/core/version.txt, the version and ?v= strings in docs/core/index.html and docs/core/test/index.html,
and CACHE + SHELL in docs/core/sw.js (SHELL = every script index.html loads)."""
import re, sys, pathlib
v = sys.argv[1]; root = pathlib.Path("docs/core")
(root / "version.txt").write_text(v + "\n")
files = []
for name in ("index.html", "test/index.html"):
    p = root / name
    if not p.exists(): continue
    s = p.read_text()
    s = re.sub(r'CORE_VERSION = "[^"]*"', 'CORE_VERSION = "%s"' % v, s)
    s = re.sub(r'\?v=[\w.\-]+"', '?v=%s"' % v, s)
    p.write_text(s)
    if name == "index.html": files = re.findall(r'<script src="([\w.\-/]+)\?v=', s)
    else:  # the guided test loads exactly the app's scripts, from one folder up
        s = re.sub(r'<!--SCRIPTS-->.*?<!--END-->', '<!--SCRIPTS-->' + "".join('<script src="../%s?v=%s"></script>' % (f, v) for f in files) + '<!--END-->', s, flags=re.S)
        p.write_text(s)
sw = root / "sw.js"; s = sw.read_text()
s = re.sub(r'const CACHE = "[^"]*";', 'const CACHE = "core-%s";' % v, s)
shell = ["./", "./index.html", "./core.css"] + ["./" + f for f in files] + ["./manifest.webmanifest", "./safe/", "./safe/index.html"]
s = re.sub(r'const SHELL = \[[^\]]*\];', 'const SHELL = [' + ", ".join('"%s"' % f for f in shell) + '];', s)
sw.write_text(s)
print("Core is now version", v, "with", len(files), "scripts")
