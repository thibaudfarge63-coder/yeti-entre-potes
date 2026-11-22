# Génère la carte Risk (42 territoires) depuis Natural Earth 1:50m (domaine public).
import json, math, sys
from shapely.geometry import shape, Polygon, MultiPolygon, mapping
from shapely.ops import unary_union, transform
from shapely.affinity import translate
NE = '/home/claude/ne/'
C = json.load(open(NE + 'countries.geojson'))['features']
S = json.load(open(NE + 'states.geojson'))['features']
COUNTRY = {
 'alaska': [], 'greenland': ['Greenland'], 'camerica': ['Mexico','Guatemala','Belize','Honduras','El Salvador','Nicaragua','Costa Rica','Panama','Cuba','Jamaica','Haiti','Dominican Republic','The Bahamas','Puerto Rico'],
 'venezuela': ['Venezuela','Colombia','Guyana','Suriname'], 'peru': ['Peru','Ecuador','Bolivia'], 'brazil': ['Brazil'], 'argentina': ['Argentina','Chile','Uruguay','Paraguay','Falkland Islands'],
 'iceland': ['Iceland'], 'gb': ['United Kingdom','Ireland'], 'scandinavia': ['Norway','Sweden','Finland','Denmark'],
 'neurope': ['Germany','Poland','Czechia','Slovakia','Austria','Netherlands','Belgium','Luxembourg','Switzerland','Liechtenstein'],
 'weurope': ['France','Spain','Portugal','Andorra','Monaco'],
 'seurope': ['Italy','Greece','Bulgaria','Romania','Hungary','Slovenia','Croatia','Bosnia and Herzegovina','Republic of Serbia','Montenegro','Kosovo','Albania','North Macedonia','Malta','San Marino','Vatican'],
 'ukraine': ['Ukraine','Belarus','Estonia','Latvia','Lithuania','Moldova'],
 'nafrica': ['Morocco','Algeria','Tunisia','Mauritania','Mali','Niger','Chad','Senegal','Gambia','Guinea','Guinea-Bissau','Sierra Leone','Liberia','Ivory Coast',"Côte d'Ivoire",'Burkina Faso','Ghana','Togo','Benin','Nigeria','Western Sahara','W. Sahara','Cabo Verde'],
 'egypt': ['Egypt','Libya'], 'eafrica': ['Sudan','South Sudan','Ethiopia','Eritrea','Djibouti','Somalia','Somaliland','Kenya','Uganda','Tanzania','United Republic of Tanzania','Rwanda','Burundi'],
 'congo': ['Democratic Republic of the Congo','Republic of the Congo','Central African Republic','Cameroon','Gabon','Equatorial Guinea'],
 'safrica': ['South Africa','Namibia','Botswana','Zimbabwe','Mozambique','Zambia','Malawi','Angola','Lesotho','eSwatini','Eswatini'],
 'madagascar': ['Madagascar'],
 'mideast': ['Turkey','Syria','Iraq','Iran','Saudi Arabia','Yemen','Oman','United Arab Emirates','Qatar','Kuwait','Bahrain','Jordan','Israel','Palestine','Lebanon','Cyprus','Northern Cyprus','Georgia','Armenia','Azerbaijan'],
 'afghanistan': ['Afghanistan','Kazakhstan','Uzbekistan','Turkmenistan','Kyrgyzstan','Tajikistan'],
 'india': ['India','Pakistan','Nepal','Bhutan','Bangladesh','Sri Lanka'], 'siam': ['Thailand','Myanmar','Laos','Cambodia','Vietnam'],
 'mongolia': ['Mongolia','North Korea','South Korea'], 'china': ['Taiwan'], 'japan': ['Japan'],
 'indonesia': ['Philippines','East Timor','Timor-Leste','Brunei'], 'newguinea': ['Papua New Guinea'], 'eaustralia': ['New Zealand'],
}
OWN = {}
for t, L in COUNTRY.items():
    for n in L: OWN[n] = t
SPLIT = {'United States of America', 'Canada', 'Russia', 'Australia', 'Indonesia', 'China', 'Malaysia'}
def russia(name, lon):
    if name == 'Sakha (Yakutia)': return 'yakutsk'
    if name == 'Gorno-Altay': return 'china'  # évite que l'Afghanistan touche la Sibérie
    if name in ('Irkutsk', 'Buryat', 'Chita'): return 'irkutsk'
    if name in ('Kamchatka', 'Chukchi Autonomous Okrug', 'Maga Buryatdan', 'Khabarovsk', "Primor'ye", 'Sakhalin', 'Yevrey', 'Amur'): return 'kamchatka'
    if name in ('Sverdlovsk', 'Chelyabinsk', 'Kurgan', "Tyumen'", 'Khanty-Mansiy', 'Yamal-Nenets', 'Omsk', 'Novosibirsk', 'Altay'): return 'ural'
    if lon < 58: return 'ukraine'
    return 'siberia'
CANADA = {'Yukon': 'nwt', 'Northwest Territories': 'nwt', 'Nunavut': 'nwt', 'British Columbia': 'alberta', 'Alberta': 'alberta',
          'Saskatchewan': 'ontario', 'Manitoba': 'ontario', 'Ontario': 'ontario'}
geoms = {t: [] for t in COUNTRY}
for t in ['alaska', 'nwt', 'alberta', 'ontario', 'quebec', 'wus', 'eus', 'ural', 'siberia', 'yakutsk', 'kamchatka', 'irkutsk', 'china', 'waustralia', 'eaustralia', 'newguinea', 'indonesia']:
    geoms.setdefault(t, [])
def parts(g):
    return list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
def fixlon(p, owner):
    c = p.centroid.x
    if c < -169: return translate(p, 360)           # Tchoukotka passée l'antiméridien
    if owner == 'alaska' and c > 0: return None      # îles Aléoutiennes de l'autre côté
    return p
for f in S:
    pr = f['properties']; a = pr['admin']; n = pr['name']; g = shape(f['geometry'])
    lon = g.representative_point().x
    t = None
    if a == 'United States of America':
        t = 'alaska' if n == 'Alaska' else None if n == 'Hawaii' else ('wus' if lon < -97 else 'eus')
    elif a == 'Canada': t = CANADA.get(n, 'quebec')
    elif a == 'Russia': t = russia(n, lon if lon > -169 else lon + 360)
    elif a == 'Australia': t = 'waustralia' if n in ('Western Australia', 'Northern Territory', 'South Australia') else 'eaustralia'
    elif a == 'Indonesia': t = 'newguinea' if n in ('Papua', 'Papua Barat') else 'indonesia'
    elif a == 'China': t = 'mongolia' if n in ('Inner Mongol', 'Nei Mongol', 'Heilongjiang', 'Jilin', 'Liaoning') else 'china'
    if t:
        for p in parts(g.buffer(0)):
            p = fixlon(p, t)
            if p is not None: geoms[t].append(p)
for f in C:
    pr = f['properties']; n = pr['ADMIN']
    if n in SPLIT and n != 'Malaysia': continue
    g = shape(f['geometry']).buffer(0)
    for p in parts(g):
        c = p.centroid
        if n == 'Malaysia': t = 'siam' if c.x < 105 else 'indonesia'
        elif n == 'France':
            t = 'venezuela' if -60 < c.x < -50 and c.y > 0 else 'weurope' if -10 < c.x < 12 and c.y > 40 else None
        elif n in ('Netherlands', 'Denmark', 'Norway', 'United Kingdom', 'Spain', 'Portugal'):
            t = OWN.get(n) if c.x > -20 and c.y > 35 else None
        else: t = OWN.get(n)
        if t: geoms[t].append(fixlon(p, t))
missing = [t for t, g in geoms.items() if not g]
assert not missing, missing
print('chinese provinces check', len(geoms['china']), file=sys.stderr)
# Projection Miller, longitude -168..192, latitude -56..84
W = 1000
L0, L1 = -168, 192
def mill(lat): return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))
Y0, Y1 = mill(84), mill(-56)
sx = W / (L1 - L0)
H = round((Y0 - Y1) / math.radians(1) * sx)
def proj(x, y, z=None):
    import numpy as np
    x = np.asarray(x); y = np.clip(np.asarray(y), -56, 84)
    return ((x - L0) * sx, (Y0 - 1.25 * np.log(np.tan(np.pi / 4 + 0.4 * np.radians(y)))) / math.radians(1) * sx)
out = {}
for t, ps in geoms.items():
    u = unary_union([p for p in ps if p is not None and p.area > 0.02])
    u = transform(proj, u)
    u = u.buffer(0.6).buffer(-0.6)  # bouche les petits trous entre provinces
    u = u.simplify(0.45, preserve_topology=True)
    keep = [p for p in parts(u) if p.area > 6]
    u = MultiPolygon(keep) if len(keep) > 1 else keep[0]
    def ring(r):
        pts = list(r.coords)[:-1]
        s = 'M' + ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z'
        return s.replace('.0,', ',').replace('.0 ', ' ').replace('.0Z', 'Z')
    d = ''.join(ring(p.exterior) for p in parts(u))
    big = max(parts(u), key=lambda p: p.area)
    lp = big.representative_point()
    out[t] = {'d': d, 'x': round(lp.x, 1), 'y': round(lp.y, 1)}
json.dump({'w': W, 'h': H, 't': out}, open('/home/claude/ne/map.json', 'w'), separators=(',', ':'))
print('ok', H, sum(len(v['d']) for v in out.values()))
# --- liens maritimes (voisins dans les règles mais pas collés sur la carte) + points d'étiquette
from shapely.ops import polylabel
from shapely.geometry import shape as _s
import subprocess
adj = json.loads(subprocess.check_output(['node', '-e', "import('/home/claude/repo/supabase/functions/yeti-risk/engine.js').then(()=>console.log(JSON.stringify(Object.fromEntries(RiskEngine.IDS.map(t=>[t,RiskEngine.TERR[t].adj])))))"]))
from shapely import wkt
from shapely.geometry import Polygon as P2
def poly(d):
    ps = []
    for r in d.split('M')[1:]:
        pts = [tuple(map(float, xy.split(','))) for xy in r.rstrip('Z').split(' ')]
        ps.append(P2(pts).buffer(0))
    return unary_union(ps)
G = {t: poly(v['d']) for t, v in out.items()}
links = []
for a in adj:
    for b in adj[a]:
        if a < b and G[a].distance(G[b]) > 1.2: links.append([a, b])
for t in out:
    big = max(parts(G[t]), key=lambda p: p.area)
    lp = polylabel(big, 0.5)
    out[t]['x'], out[t]['y'] = round(lp.x, 1), round(lp.y, 1)
def compact(d):
    """Chemin en coordonnées relatives arrondies au demi-pixel (fichier 2× plus léger)."""
    out = []
    for ring in d.split('M')[1:]:
        pts = [(round(float(x) * 2) / 2, round(float(y) * 2) / 2) for x, y in (p.split(',') for p in ring.rstrip('Z').split(' '))]
        q = [pts[0]]
        for p in pts[1:]:
            if p != q[-1]: q.append(p)
        if len(q) < 3: continue
        px, py = q[0]; rel = []
        for x, y in q[1:]: rel.append('%g %g' % (x - px, y - py)); px, py = x, y
        out.append('M%g %g' % q[0] + 'l' + ' '.join(rel) + 'z')
    return ''.join(out).replace(' -', '-')
for t in out: out[t]['d'] = compact(out[t]['d'])
js = '/* Carte du monde du Risk : 42 territoires dessinés depuis Natural Earth 1:50m (domaine public), projection de Miller.\n   Généré par tools/mkmap.py — ne pas modifier à la main. */\nwindow.RISK_MAP = ' + json.dumps({'w': W, 'h': H, 't': out, 'links': links}, separators=(',', ':'), ensure_ascii=False) + ';\n'
open('/home/claude/repo/risk-map.js', 'w').write(js)
print('liens', links, len(js))
