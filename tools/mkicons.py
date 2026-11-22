# Silhouettes des troupes du Risk : game-icons.net (CC BY 3.0) + soldat et lama dessinés maison.
import re, json, sys
GI = '/home/claude/gi/icons/'
SRC = {'char': 'lorc/tank', 'taureau': 'delapouite/bison', 'vache': 'delapouite/cow', 'elephant': 'delapouite/elephant',
       'chameau': 'delapouite/camel', 'tigre': 'delapouite/tiger', 'kangourou': 'delapouite/kangaroo', 'des': 'delapouite/rolling-dices',
       'drapeau': 'lorc/flying-flag' if False else 'delapouite/flying-flag', 'carte': 'delapouite/card-random', 'mission': 'delapouite/scroll-quill'}
out = {}
import os
for k, n in SRC.items():
    f = GI + n + '.svg'
    if not os.path.exists(f):
        alt = [x for x in os.popen(f'ls {GI}*/{n.split("/")[1]}.svg').read().split()]
        if not alt: print('manque', n, file=sys.stderr); continue
        f = alt[0]
    s = open(f).read()
    out[k] = ' '.join(re.findall(r'<path[^>]*d="([^"]+)"', s)[1:])
# maison (repère 512)
out['soldat'] = ('M168 150c0-60 40-96 88-96s88 36 88 96zM150 146h212v22H150zM216 192a40 40 0 1 0 80 0a40 40 0 1 0-80 0z'
  'M196 240h120l14 116H182zM146 252l50-12 8 30-42 70-28-12zM316 240l48 22-10 26-44-18zM188 360h58v124h-62zM266 360h58l4 124h-62z'
  'M354 96h18v300h-18zM356 66l7-34 7 34z')
out['lama'] = ('M330 46l8 26 10-30 10 34c18 10 26 26 22 44l-8 16c-6 8-16 12-28 12l-10 118c-2 26-10 42-24 52v150h-34V350c-34 10-72 10-104 2v116h-34V340'
  'c-30-16-42-42-42-80 0-42 40-64 110-64h70c16 0 26-12 28-34l8-74c2-20 10-34 26-38z'
  'M122 270c-22 0-34 14-34 34 16-2 28-10 36-22z')
json.dump(out, open('/home/claude/ne/icons.json', 'w'))
print({k: len(v) for k, v in out.items()})
