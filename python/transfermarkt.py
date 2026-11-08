# -*- coding: utf-8 -*-
"""
FM Scouts – stahování údajů z Transfermarktu (tržní hodnota, pozice,
smlouva, preferovaná noha) do data/tm_data.json.

Nová verze Petrova notebooku Documents/Python/data_scout/transfm.ipynb.
Místo hledání každého hráče zvlášť (12 000 hráčů = dny) čte soupisky klubů:
jedna stránka klubu obsahuje údaje všech jeho hráčů, takže stačí ~450 stránek.

Postup:
  1. Pro každou ligu z python/ligy.csv (sloupec tm_kod) stáhne stránku soutěže
     na Transfermarktu a z ní seznam klubů.
  2. Naše kluby z data/db.xlsx spáruje s kluby Transfermarktu v téže lize
     (ruční výjimky v python/tm_kluby.csv mají přednost).
  3. Stáhne podrobnou soupisku každého klubu a hráče spáruje podle jména
     a data narození.
  4. Hráče, které v soupisce nenašel (např. po přestupu), dohledá postaru přes
     jejich profil – jen pokud v sezóně odehráli aspoň minutu a nemají údaje,
     nebo jsou starší než 60 dní (s --vsichni i hráče bez minut).
  5. Uloží data/tm_data.json (stejný formát i klíče jako dřív, appka ho při
     buildu přimíchá k hráčům).

Stažené stránky se ukládají do data/tm_cache/ (není na GitHubu). Když běh
přerušíš (Ctrl+C) nebo tě Transfermarkt dočasně zablokuje, další spuštění
pokračuje tam, kde skončil – čerstvě stažené kluby znovu nestahuje.

Spuštění (v terminálu ve složce projektu):
  py python/transfermarkt.py              # celý běh
  py python/transfermarkt.py --jen-ligy   # jen kroky 1–2 (kontrola párování klubů)
  py python/transfermarkt.py --bez-profilu  # přeskočí krok 4
"""

import argparse
import json
import random
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
import requests

# --- Cesty a nastavení -------------------------------------------------------
PROJEKT = Path(__file__).resolve().parent.parent
DB = PROJEKT / "data" / "db.xlsx"
VYSTUP = PROJEKT / "data" / "tm_data.json"
CACHE = PROJEKT / "data" / "tm_cache"
REPORT = CACHE / "report.json"
LIGY = PROJEKT / "python" / "ligy.csv"
KLUBY_VYJIMKY = PROJEKT / "python" / "tm_kluby.csv"
HRACI_VYJIMKY = PROJEKT / "python" / "tm_hraci.csv"   # ruční ID hráčů, které vyhledávání nenajde
TM = "https://www.transfermarkt.com"

STARI_SOUPISKY_DNI = 2    # soupisku staženou před méně než 2 dny znovu nestahujeme (pokračování po přerušení)
STARI_LIGY_DNI = 30       # seznam klubů ligy stačí obnovit jednou za měsíc
STARI_PROFILU_DNI = 60    # hráče mimo soupisku dohledáváme, jen když jsou jeho údaje starší
OPAKOVAT_NENALEZENE_DNI = 30  # nenalezeného hráče zkusíme hledat znovu až po měsíci

# Stejné ohleduplné tempo jako původní skript: 5–10 s mezi dotazy,
# po každých 30 dotazech delší pauza. Zrychlení je jen v tom, že dotazů je
# mnohem méně – tempo nezvyšujeme, aby nás Transfermarkt neblokoval.
PRODLEVA = (5, 10)
PAUZA_KAZDYCH = 30
PAUZA = (45, 90)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
]
BLOCK_STATUS_CODES = {429, 502, 503, 520, 521, 522, 523, 524}


# ---------------------------------------------------------------------------
# Klíč hráče (jméno + klub) – MUSÍ dávat stejný výsledek jako
# lib/normalize.js (playerClubKey), jinak by appka údaje nenapárovala.
# (Převzato beze změny z transfm.ipynb.)
# ---------------------------------------------------------------------------
EXTRA_CHAR_MAP = {
    "ø": "o", "Ø": "O", "đ": "d", "Đ": "D", "ł": "l", "Ł": "L",
    "ß": "ss", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE",
}
CLUB_NOISE_WORDS = {
    "fc", "cf", "sc", "ac", "sk", "fk", "bk", "if", "afc", "cfc",
    "club", "football", "soccer", "united", "city",
}

def strip_diacritics(s):
    mapped = "".join(EXTRA_CHAR_MAP.get(ch, ch) for ch in s)
    nfd = unicodedata.normalize("NFD", mapped)
    return "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn")

def normalize_player_name(name):
    s = strip_diacritics(name or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def normalize_club_name(name):
    s = strip_diacritics(name or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    tokens = [t for t in s.split() if t and t not in CLUB_NOISE_WORDS]
    return " ".join(tokens).strip()

def player_club_key(player_name, club_name):
    return f"{normalize_player_name(player_name)}::{normalize_club_name(club_name)}"


# ---------------------------------------------------------------------------
# Stahování stránek (s ohleduplným tempem a reakcí na blokaci)
# ---------------------------------------------------------------------------
class Stahovac:
    def __init__(self):
        self.session = requests.Session()
        self.pocet = 0
        self.blokace_za_sebou = 0
        self.cykly_cekani = 0

    def get(self, url):
        """Vrátí HTML stránky, nebo None. Při opakované blokaci počká, a když
        to nepomůže, ukončí běh (postup zůstane uložený)."""
        time.sleep(random.uniform(*PRODLEVA))
        self.pocet += 1
        if self.pocet % PAUZA_KAZDYCH == 0:
            p = random.uniform(*PAUZA)
            print(f"  ☕ Pauza {p:.0f}s...")
            time.sleep(p)
        blocked = False
        try:
            r = self.session.get(url, headers={
                "User-Agent": random.choice(USER_AGENTS),
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": TM + "/",
            }, timeout=20)
            r.encoding = "utf-8"
            if r.status_code == 200:
                self.blokace_za_sebou = 0
                return r.text
            print(f"  HTTP {r.status_code} pro {url}")
            blocked = r.status_code in BLOCK_STATUS_CODES
        except requests.exceptions.RequestException as e:
            print(f"  Chyba spojení: {e}")
            blocked = True

        if blocked:
            self.blokace_za_sebou += 1
            if self.blokace_za_sebou >= 5:
                self.cykly_cekani += 1
                if self.cykly_cekani > 3:
                    raise Zablokovano()
                wait = 240 * self.cykly_cekani
                print(f"\n  ⚠ Opakované chyby typu blokace. Čekám {wait // 60} min...\n")
                time.sleep(wait)
                self.blokace_za_sebou = 0
        return None


class Zablokovano(Exception):
    pass


# ---------------------------------------------------------------------------
# Cache (stažené a zpracované stránky, ať se při opakování nestahují znovu)
# ---------------------------------------------------------------------------
def nacti_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def uloz_json(path, data, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
    tmp.replace(path)

def je_cerstve(iso, dni):
    if not iso:
        return False
    try:
        return datetime.now() - datetime.fromisoformat(iso) < timedelta(days=dni)
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Párování jmen
# ---------------------------------------------------------------------------
def podobnost(a, b):
    return SequenceMatcher(None, a, b).ratio()

def skore_klubu(nase, tm):
    """Jak moc se náš název klubu podobá názvu na Transfermarktu (0–1)."""
    a, b = normalize_club_name(nase), normalize_club_name(tm)
    if not a or not b:
        return 0
    if a == b:
        return 1
    ta, tb = set(a.split()), set(b.split())
    spolecne = len(ta & tb) / len(ta | tb)
    obsazeno = 0.9 if ta <= tb or tb <= ta else 0
    return max(podobnost(a, b), spolecne * 0.9, obsazeno)

def prirad(nase_seznam, tm_seznam, skore_fn, prah):
    """Spáruje dvě skupiny podle skóre: od nejlepších dvojic dolů, každý
    prvek nejvýš jednou. Vrátí {náš: (tm, skóre)}."""
    dvojice = []
    for n in nase_seznam:
        for t in tm_seznam:
            s = skore_fn(n, t)
            if s >= prah:
                dvojice.append((s, n, t))
    dvojice.sort(key=lambda x: -x[0])
    vysledek, pouzite = {}, set()
    for s, n, t in dvojice:
        tid = id(t)
        if n in vysledek or tid in pouzite:
            continue
        vysledek[n] = (t, s)
        pouzite.add(tid)
    return vysledek


# ---------------------------------------------------------------------------
# Krok 1: seznam klubů ligy
# ---------------------------------------------------------------------------
def tm_sezona(season_text):
    """Sezóna z naší databáze -> saison_id na Transfermarktu.
    "2026/2027" -> 2026; jednoroční "2026" (Skandinávie apod.) -> 2025,
    protože Transfermarkt jednoroční sezóny čísluje předchozím rokem."""
    s = str(season_text)
    m = re.match(r"(\d{4})\s*/\s*(\d{4})", s)
    if m:
        return int(m.group(1))
    m = re.match(r"(\d{4})", s)
    return int(m.group(1)) - 1 if m else datetime.now().year

def kluby_ligy(stahovac, kod, sezona, cache_ligy):
    klic = f"{kod}-{sezona}"
    zaznam = cache_ligy.get(klic)
    if zaznam and je_cerstve(zaznam.get("stazeno"), STARI_LIGY_DNI) and zaznam.get("kluby"):
        return zaznam
    html = stahovac.get(f"{TM}/x/startseite/wettbewerb/{kod}/saison_id/{sezona}")
    if not html:
        return zaznam or {"kluby": []}
    nazev = re.search(r"<title>\s*(.*?)\s*\|", html, re.S)
    kluby = {}
    for m in re.finditer(r'<a title="([^"]+)" href="/([^"/]+)/kader/verein/(\d+)/saison_id/\d+"', html):
        kluby.setdefault(m.group(3), {"id": m.group(3), "nazev": m.group(1), "slug": m.group(2)})
    zaznam = {"stazeno": datetime.now().isoformat(), "soutez": nazev.group(1) if nazev else kod,
              "kluby": list(kluby.values())}
    cache_ligy[klic] = zaznam
    return zaznam


# ---------------------------------------------------------------------------
# Krok 3: soupiska klubu
# ---------------------------------------------------------------------------
def text(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).replace("&nbsp;", " ").strip()

def format_hodnoty(raw):
    """"€4.00M" -> "€4.00m", "€400.0K" -> "€400k" – stejný formát jako dřív
    z profilu hráče, ať se v appce nic nezmění."""
    raw = raw.strip()
    m = re.match(r"€\s*([\d.,]+)\s*([MKmk]|bn|Bn)?$", raw)
    if not m:
        return None
    cislo, jednotka = m.group(1), (m.group(2) or "").lower()
    if jednotka == "k":
        cislo = re.sub(r"\.0+$", "", cislo)
    return f"€{cislo}{jednotka}"

def parsuj_soupisku(html):
    """Z podrobné soupisky (…/kader/verein/ID/saison_id/ROK/plus/1) vytáhne hráče."""
    tabulka = re.search(r'<table class="items">(.*?)</tbody>', html, re.S)
    if not tabulka:
        return None
    hlavicka = [text(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", tabulka.group(1), re.S)]
    # Transfermarkt občas pošle soupisku bez některých sloupců (např. bez
    # smlouvy). Nespadneme – chybějící údaj u hráčů prostě nebude, a ostatní
    # se načtou. Jen to vypíšeme, ať je vidět, že stránka vypadala jinak.
    chybi = [s for s in ("Date of birth/Age", "Foot", "Contract", "Market value") if s not in hlavicka]
    if chybi:
        print(f"    (soupiska bez sloupců: {', '.join(chybi)})")
    # Sloupce za jménem hráče, které jsou v buňkách class="zentriert" (v pořadí hlavičky).
    zentriert = [h for h in hlavicka[2:] if h not in ("Market value",)]

    hraci = []
    radky = re.split(r'<tr class="(?:odd|even)">', tabulka.group(1))[1:]
    for r in radky:
        prof = re.search(r'<td class="hauptlink">\s*<a href="(/[^"/]+/profil/spieler/(\d+))">(.*?)</a>', r, re.S)
        if not prof:
            continue
        hrac = {"tmUrl": TM + prof.group(1), "jmeno": text(prof.group(3))}
        pozice = re.search(r'<td class="hauptlink">.*?</tr>\s*<tr>\s*<td>\s*(.*?)\s*</td>', r, re.S)
        if pozice:
            hrac["position"] = text(pozice.group(1))
        # Buňky za vnořenou tabulkou se jménem
        zbytek = r.split("</table>", 1)[-1]
        bunky = re.findall(r'<td class="zentriert">(.*?)</td>', zbytek, re.S)
        hodnoty = dict(zip(zentriert, bunky))
        dob = re.match(r"(\d{2})/(\d{2})/(\d{4})", text(hodnoty.get("Date of birth/Age", "")))
        if dob:
            hrac["dob"] = f"{dob.group(3)}/{dob.group(2)}/{dob.group(1)}"   # stejný formát jako naše databáze
        noha = text(hodnoty.get("Foot", "")).lower()
        if noha in ("right", "left", "both"):
            hrac["foot"] = noha
        smlouva = text(hodnoty.get("Contract", ""))
        if re.search(r"20[23]\d", smlouva):
            hrac["contractUntil"] = smlouva
        mv = re.search(r'<td class="rechts hauptlink">.*?>\s*(€[^<]+?)\s*<', r, re.S)
        if mv:
            hodnota = format_hodnoty(mv.group(1))
            if hodnota:
                hrac["marketValue"] = hodnota
        hraci.append(hrac)
    return hraci

def soupiska(stahovac, klub, sezona, cache_soupisky):
    klic = f"{klub['id']}-{sezona}"
    zaznam = cache_soupisky.get(klic)
    if zaznam and je_cerstve(zaznam.get("stazeno"), STARI_SOUPISKY_DNI):
        return zaznam["hraci"]
    html = stahovac.get(f"{TM}/{klub['slug']}/kader/verein/{klub['id']}/saison_id/{sezona}/plus/1")
    if not html:
        return zaznam["hraci"] if zaznam else None
    hraci = parsuj_soupisku(html)
    if hraci is None:
        return zaznam["hraci"] if zaznam else None
    cache_soupisky[klic] = {"stazeno": datetime.now().isoformat(), "hraci": hraci}
    return hraci

def skore_hrace(nas, tm):
    """nas/tm = (normalizované jméno, datum narození). Datum narození je silný
    důkaz, takže při shodě data stačí podobné jméno."""
    jn, dn = nas
    jt, dt = tm
    s = podobnost(jn, jt)
    spolecne_slovo = bool(set(jn.split()) & set(jt.split()))
    if dn and dt and dn == dt:
        return 1.0 if (s >= 0.5 or spolecne_slovo) else 0
    # FootyStats má občas datum narození špatně (prohozený den a měsíc, jiný
    # rok), proto při stejném nebo skoro stejném jménu v jednom klubu
    # párujeme i bez shody data – jen s o něco nižším skóre.
    if jn == jt:
        return 0.95
    return s * 0.95 if s >= 0.88 else 0


# ---------------------------------------------------------------------------
# Krok 4: dohledání hráče přes profil (původní postup z transfm.ipynb)
# ---------------------------------------------------------------------------
SEARCH_CHAR_MAP = {"Đ": "Dj", "đ": "dj", "Æ": "Ae", "æ": "ae", "Å": "A", "å": "a", "Ø": "O", "ø": "o"}

def hledej_hrace(stahovac, jmeno, klub):
    casti = jmeno.strip().split()
    varianty = [jmeno]
    if len(casti) >= 3:
        varianty.append(casti[0] + " " + casti[-1])
    if len(casti) >= 2:
        varianty += [casti[-1] + " " + klub[:10], casti[-1]]
    for v in varianty:
        q = "".join(SEARCH_CHAR_MAP.get(ch, ch) for ch in v)
        html = stahovac.get(f"{TM}/schnellsuche/ergebnis/schnellsuche?query={quote_plus(q)}")
        if html:
            m = re.search(r'href="(/[^"]+/profil/spieler/\d+)"', html)
            if m:
                return TM + m.group(1)
    return None

def parsuj_profil(html):
    vysledek = {}
    mv = re.search(r"Market value:\s*(€[\d,.]+\s*(?:m|k|bn)?)", html, re.IGNORECASE)
    if mv:
        # Stejný zápis jako ze soupisky ("€400k", "€6.00m"), ať se v appce zobrazuje jednotně
        vysledek["marketValue"] = format_hodnoty(mv.group(1)) or mv.group(1).strip()
    pos = re.search(r"➤\s*([A-Za-z\s\-]+?)\s*➤\s*Market value", html)
    if pos:
        vysledek["position"] = pos.group(1).strip()
    contract = re.search(r"Contract expires[^<]*<[^>]+>\s*([^<]{4,20})", html, re.IGNORECASE)
    if contract and re.search(r"20[23]\d", contract.group(1)):
        vysledek["contractUntil"] = contract.group(1).strip()
    # Noha: popisek a hodnota jsou na profilu ve dvou samostatných značkách,
    # proto původní vzor nefungoval. Tenhle přeskočí libovolné značky mezi nimi.
    foot = re.search(r"Foot:\s*(?:<[^>]+>\s*)+(right|left|both)\b", html, re.IGNORECASE)
    if foot:
        vysledek["foot"] = foot.group(1).lower()
    return vysledek


# ---------------------------------------------------------------------------
# Hlavní běh
# ---------------------------------------------------------------------------
def nacti_vyjimky():
    if not KLUBY_VYJIMKY.exists():
        return {}
    df = pd.read_csv(KLUBY_VYJIMKY, sep=";", encoding="utf-8-sig", dtype=str).dropna(subset=["klub", "tm_id"])
    return {r["klub"].strip(): r["tm_id"].strip() for _, r in df.iterrows()}

def nacti_vyjimky_hracu():
    """Ruční výjimky hráčů z tm_hraci.csv: klíč hráče -> adresa jeho profilu na Transfermarktu."""
    if not HRACI_VYJIMKY.exists():
        return {}
    df = pd.read_csv(HRACI_VYJIMKY, sep=";", encoding="utf-8-sig", dtype=str).dropna(subset=["hrac", "klub", "tm_id"])
    # Na Transfermarktu stačí ID hráče, část adresy se jménem může být libovolná
    return {player_club_key(r["hrac"].strip(), r["klub"].strip()): f"{TM}/x/profil/spieler/{r['tm_id'].strip()}"
            for _, r in df.iterrows()}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jen-ligy", action="store_true", help="jen stáhnout seznamy klubů a ukázat párování")
    parser.add_argument("--bez-profilu", action="store_true", help="nedohledávat hráče mimo soupisky")
    parser.add_argument("--kluby", help="zpracovat jen tyto kluby (názvy oddělené čárkou), např. pro test")
    parser.add_argument("--vsichni", action="store_true",
                        help="přes profil dohledávat i hráče s 0 odehranými minutami (výrazně delší běh)")
    args = parser.parse_args()
    jen_kluby = {k.strip() for k in args.kluby.split(",")} if args.kluby else None

    print(f"\n{'#' * 50}\n  FM Scouts – Transfermarkt\n  {datetime.now():%Y-%m-%d %H:%M}\n{'#' * 50}")

    db = pd.read_excel(DB, usecols=["player_name", "birthday", "Current Club", "league_name", "season", "minutes_played"])
    db = db.dropna(subset=["player_name", "Current Club"])
    ligy = pd.read_csv(LIGY, sep=";", encoding="utf-8-sig", dtype=str)
    kody = {r["league_name"]: (r.get("tm_kod") or "").strip() for _, r in ligy.iterrows()}
    vyjimky = nacti_vyjimky()

    cache_ligy = nacti_json(CACHE / "ligy.json", {})
    cache_soupisky = nacti_json(CACHE / "soupisky.json", {})
    tm_data = nacti_json(VYSTUP, {})
    report = {"kluby_nesparovane": [], "kluby_sparovane": [], "hraci_mimo_soupisku": 0}
    stahovac = Stahovac()
    ted = datetime.now().isoformat()

    # --- Kroky 1 a 2: kluby ---------------------------------------------------
    print("\n=== 1) Seznamy klubů v ligách")
    klub_tm = {}      # náš klub -> (tm klub, sezóna)
    for liga, d in db.groupby("league_name", sort=False):
        kod = kody.get(liga)
        if not kod:
            print(f"  ! {liga}: chybí tm_kod v python/ligy.csv, přeskakuji")
            continue
        sezona = tm_sezona(d["season"].iloc[0])
        zaznam = kluby_ligy(stahovac, kod, sezona, cache_ligy)
        uloz_json(CACHE / "ligy.json", cache_ligy)
        tm_kluby = zaznam.get("kluby", [])
        nase = sorted(d["Current Club"].unique())
        print(f"  {liga:<32} -> {zaznam.get('soutez', '?'):<28} {len(tm_kluby):>2} klubů na TM, {len(nase):>2} u nás")

        # Ruční výjimky mají přednost
        zbyle = []
        for k in nase:
            if k in vyjimky:
                klub = next((t for t in tm_kluby if t["id"] == vyjimky[k]), {"id": vyjimky[k], "nazev": f"(výjimka {vyjimky[k]})", "slug": "x"})
                klub_tm[k] = (klub, sezona)
                report["kluby_sparovane"].append({"liga": liga, "klub": k, "tm": klub["nazev"], "tm_id": klub["id"], "jak": "výjimka"})
            else:
                zbyle.append(k)
        par = prirad(zbyle, tm_kluby, lambda n, t: skore_klubu(n, t["nazev"]), 0.45)
        for k in zbyle:
            if k in par:
                klub, s = par[k]
                klub_tm[k] = (klub, sezona)
                report["kluby_sparovane"].append({"liga": liga, "klub": k, "tm": klub["nazev"], "tm_id": klub["id"], "skore": round(s, 2)})
            else:
                kandidati = sorted(tm_kluby, key=lambda t: -skore_klubu(k, t["nazev"]))[:3]
                report["kluby_nesparovane"].append({"liga": liga, "klub": k, "kandidati": [f"{t['nazev']} ({t['id']})" for t in kandidati]})

    print(f"\n  Spárováno {len(klub_tm)} klubů, nespárováno {len(report['kluby_nesparovane'])}.")
    for n in report["kluby_nesparovane"]:
        print(f"   ✗ {n['liga']}: {n['klub']}  (kandidáti: {', '.join(n['kandidati'])})")
    if args.jen_ligy:
        uloz_json(REPORT, report, indent=2)
        print(f"\nPodrobnosti: {REPORT}")
        return

    # --- Krok 3: soupisky -----------------------------------------------------
    print("\n=== 2) Soupisky klubů")
    if jen_kluby:
        klub_tm = {k: v for k, v in klub_tm.items() if k in jen_kluby}
        report["kluby_nesparovane"] = [n for n in report["kluby_nesparovane"] if n["klub"] in jen_kluby]
    mimo = []   # hráči, které v soupisce nenajdeme
    try:
        for i, (klub, (tmk, sezona)) in enumerate(sorted(klub_tm.items()), 1):
            hraci_tm = soupiska(stahovac, tmk, sezona, cache_soupisky)
            nasi = db[db["Current Club"] == klub].drop_duplicates(subset=["player_name"])
            if hraci_tm is None:
                print(f"  [{i}/{len(klub_tm)}] {klub}: soupisku se nepodařilo stáhnout")
                mimo += [(r["player_name"], klub) for _, r in nasi.iterrows()]
                continue
            nasi_kl = [(normalize_player_name(r["player_name"]), str(r["birthday"]) if pd.notna(r["birthday"]) else None, r["player_name"]) for _, r in nasi.iterrows()]
            tm_kl = [(normalize_player_name(h["jmeno"]), h.get("dob"), h) for h in hraci_tm]
            par = prirad(nasi_kl, tm_kl, lambda n, t: skore_hrace(n[:2], t[:2]), 0.5)
            for n in nasi_kl:
                jmeno = n[2]
                if n in par:
                    h = par[n][0][2]
                    zaznam = {k: v for k, v in h.items() if k in ("marketValue", "position", "contractUntil", "foot", "tmUrl")}
                    zaznam["lastUpdated"] = ted
                    tm_data[player_club_key(jmeno, klub)] = zaznam
                else:
                    mimo.append((jmeno, klub))
            print(f"  [{i}/{len(klub_tm)}] {klub}: {len(par)}/{len(nasi_kl)} hráčů")
            if i % 10 == 0:
                uloz_json(CACHE / "soupisky.json", cache_soupisky)
                uloz_json(VYSTUP, tm_data, indent=2)
    except (Zablokovano, KeyboardInterrupt) as e:
        uloz_json(CACHE / "soupisky.json", cache_soupisky)
        uloz_json(VYSTUP, tm_data, indent=2)
        print("\n!!! Transfermarkt nás dočasně blokuje." if isinstance(e, Zablokovano) else "\nPřerušeno.")
        print("Postup je uložený, spusť skript znovu později (klidně zítra) a bude pokračovat.")
        sys.exit(1)
    uloz_json(CACHE / "soupisky.json", cache_soupisky)
    uloz_json(VYSTUP, tm_data, indent=2)

    # Hráči z nespárovaných klubů jdou taky do dohledání přes profil
    for n in report["kluby_nesparovane"]:
        mimo += [(j, n["klub"]) for j in db[db["Current Club"] == n["klub"]]["player_name"].unique()]
    report["hraci_mimo_soupisku"] = len(mimo)

    # --- Krok 4: dohledání přes profil ---------------------------------------
    # Hráče bez odehraných minut (mládežníci, odchody) přes profil nedohledáváme,
    # pokud to nechceš (--vsichni) – jinak by běh trval hodiny navíc.
    minuty = {(r["player_name"], r["Current Club"]): r["minutes_played"] for _, r in db.iterrows()}
    if not args.vsichni:
        mimo = [(j, k) for j, k in mimo if (minuty.get((j, k)) or 0) > 0]
    vyjimky_hracu = nacti_vyjimky_hracu()
    k_dohledani = []
    for jmeno, klub in mimo:
        klic = player_club_key(jmeno, klub)
        ex = tm_data.get(klic, {})
        # Hráč s ruční výjimkou, který ještě nemá údaje z jejího profilu -> stáhnout hned
        if klic in vyjimky_hracu and ex.get("tmUrl") != vyjimky_hracu[klic]:
            k_dohledani.append((jmeno, klub))
        elif ex.get("error"):
            if not je_cerstve(ex.get("lastUpdated"), OPAKOVAT_NENALEZENE_DNI):
                k_dohledani.append((jmeno, klub))
        elif not je_cerstve(ex.get("lastUpdated"), STARI_PROFILU_DNI):
            k_dohledani.append((jmeno, klub))
    print(f"\n=== 3) Hráči mimo soupisky (s odehranými minutami): {len(mimo)}, z toho k dohledání přes profil: {len(k_dohledani)}")
    if args.bez_profilu:
        print("  (--bez-profilu: přeskakuji)")
        k_dohledani = []

    ok = 0
    try:
        for i, (jmeno, klub) in enumerate(k_dohledani, 1):
            klic = player_club_key(jmeno, klub)
            ex = tm_data.get(klic, {})
            # Pořadí: ruční výjimka > dříve nalezený profil > vyhledání podle jména
            url = vyjimky_hracu.get(klic) or ex.get("tmUrl") or hledej_hrace(stahovac, jmeno, klub)
            if not url:
                tm_data[klic] = {"lastUpdated": datetime.now().isoformat(), "error": "not found"}
                print(f"  [{i}/{len(k_dohledani)}] {jmeno} ({klub}) ✗ nenalezen")
            else:
                html = stahovac.get(url)
                if html:
                    zaznam = parsuj_profil(html)
                    zaznam["lastUpdated"] = datetime.now().isoformat()
                    zaznam["tmUrl"] = url
                    tm_data[klic] = zaznam
                    ok += 1
                    print(f"  [{i}/{len(k_dohledani)}] {jmeno} ({klub}) ✓")
            if i % 20 == 0:
                uloz_json(VYSTUP, tm_data, indent=2)
    except (Zablokovano, KeyboardInterrupt) as e:
        uloz_json(VYSTUP, tm_data, indent=2)
        print("\n!!! Transfermarkt nás dočasně blokuje." if isinstance(e, Zablokovano) else "\nPřerušeno.")
        print("Postup je uložený, spusť skript znovu později a bude pokračovat.")
        sys.exit(1)

    uloz_json(VYSTUP, tm_data, indent=2)
    uloz_json(REPORT, report, indent=2)

    # --- Souhrn ---------------------------------------------------------------
    klice = {player_club_key(r["player_name"], r["Current Club"]) for _, r in db.iterrows()}
    zaznamy = [tm_data[k] for k in klice if k in tm_data and not tm_data[k].get("error")]
    print(f"\n{'#' * 50}")
    print(f"✅ Hotovo. Dotazů na Transfermarkt: {stahovac.pocet}")
    print(f"   Hráči s údaji: {len(zaznamy)}/{len(klice)}")
    for pole, popis in (("marketValue", "tržní hodnota"), ("position", "pozice"), ("contractUntil", "smlouva"), ("foot", "noha")):
        print(f"   {popis:<14} {sum(1 for z in zaznamy if z.get(pole))}")
    print(f"{'#' * 50}")


if __name__ == "__main__":
    main()
