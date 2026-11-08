# -*- coding: utf-8 -*-
"""
Vytvoření databáze hráčů (data/db.xlsx) z CSV souborů FootyStats.

Je to přepis notebooku db_creation.ipynb do obyčejného skriptu, aby šel
spustit jedním dvojklikem (přes aktualizovat_databazi.bat). Výsledek je
stejný jako z notebooku: stejné sloupce, stejné pořadí, stejné úpravy.

Co skript dělá:
  1. (jen s --import) Přesune nově stažená CSV ze složky Stažené soubory
     do data/footystats_csv/. Starší CSV stejné ligy nemaže, ale odsune
     do data/footystats_csv/archiv/.
  2. Projde seznam lig v python/ligy.csv a ke každé lize najde v
     data/footystats_csv/ její CSV. Když CSV nějaké ligy chybí, ligu
     přeskočí (s upozorněním) a pokračuje dál. Nemusíš tedy stahovat
     všechny ligy najednou: použije se vždy poslední stažená verze.
  3. Spojí ligy, vybere a přejmenuje sloupce (stejně jako notebook)
     a uloží data/db.xlsx.
  4. Vypíše přehled lig (počet hráčů, stáří CSV) a porovná ho
     s předchozí verzí db.xlsx. Když počet hráčů v nějaké lize výrazně
     spadne, skončí s chybou a db.xlsx nepřepíše.

Spuštění ručně (v terminálu ve složce projektu):
  py python/build_db.py            # jen sestaví db.xlsx z CSV v projektu
  py python/build_db.py --import   # nejdřív převezme CSV ze Stažených souborů
"""

import argparse
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

# --- Cesty ------------------------------------------------------------------
PROJEKT = Path(__file__).resolve().parent.parent      # složka fm_scouts
CSV_DIR = PROJEKT / "data" / "footystats_csv"         # CSV z FootyStats (není na GitHubu)
ARCHIV_DIR = CSV_DIR / "archiv"                       # starší verze CSV
LIGY_SOUBOR = PROJEKT / "python" / "ligy.csv"         # seznam lig
VYSTUP = PROJEKT / "data" / "db.xlsx"                 # výsledná databáze
STAZENE = Path.home() / "Downloads"                   # složka Stažené soubory

# Když počet hráčů v lize klesne pod tento podíl oproti minulé verzi,
# skript se zastaví (nejspíš se stáhl špatný nebo neúplný soubor).
MIN_PODIL_HRACU = 0.7

# Název CSV z FootyStats, např.:
#   czech-republic-first-league-players-2026-to-2027-stats.csv
#   czech-republic-first-league-players-2026-to-2027-stats (1).csv  (druhé stažení)
# Část před "-players-" je "soubor" ze seznamu lig, čísla jsou sezóna.
VZOR_NAZVU = re.compile(r"^(?P<liga>.+)-players-(?P<od>\d{4})-to-(?P<do>\d{4})-stats(?: \(\d+\))?\.csv$", re.IGNORECASE)

# --- Sloupce: stejné jako v notebooku -------------------------------------
# Vybrané sloupce z CSV (v tomto pořadí)...
COLS = ['full_name', 'birthday_GMT', 'age', 'nationality', 'position', 'Current Club', 'league_name', 'league_nationality', 'season', 'appearances_overall', 'minutes_played_overall', 'goals_overall', 'goals_per_90_overall',
        'min_per_goal_overall', 'xg_total_overall', 'xg_per_90_overall', 'npxg_total_overall', 'npxg_per_90_overall', 'assists_overall', 'assists_per_90_overall', 'min_per_assist_overall',
        'xa_total_overall', 'xa_per_90_overall', 'goals_involved_per_90_overall', 'average_rating_overall', 'rank_in_league_top_defenders', 'rank_in_league_top_midfielders', 'rank_in_league_top_attackers',
        'shots_total_overall', 'shots_per_90_overall', 'shots_on_target_total_overall', 'shots_on_target_per_90_overall', 'shot_accuraccy_percentage_overall', 'passes_total_overall', 'passes_per_90_overall',
        'passes_completed_total_overall', 'passes_completed_per_90_overall', 'pass_completion_rate_overall', 'key_passes_total_overall', 'key_passes_per_90_overall', 'crosses_total_overall',
        'crosses_per_90_overall', 'accurate_crosses_total_overall', 'accurate_crosses_per_90_overall', 'cross_completion_rate_overall', 'dribbles_total_overall', 'dribbles_per_90_overall',
        'dribbles_successful_total_overall', 'dribbles_successful_per_90_overall', 'dribbled_past_total_overall', 'dribbled_past_per_90_overall', 'tackles_total_overall', 'tackles_per_90_overall',
        'interceptions_total_overall', 'interceptions_per_90_overall', 'blocks_total_overall', 'blocks_per_90_overall', 'clearances_total_overall', 'clearances_per_90_overall', 'aerial_duels_won_total_overall',
        'aerial_duels_won_per_90_overall', 'duels_total_overall', 'duels_per_90_overall', 'duels_won_total_overall', 'duels_won_per_90_overall', 'clean_sheets_overall', 'conceded_overall',
        'conceded_per_90_overall', 'saves_total_overall', 'saves_per_90_overall', 'shots_faced_total_overall', 'shots_faced_per_90_overall', 'save_percentage_overall', 'punches_total_overall',
        'punches_per_90_overall', 'pens_saved_total_overall'
]

# ...a jejich nové názvy v db.xlsx (ve stejném pořadí jako COLS).
NOVE_NAZVY = ['player_name', 'birthday', 'age', 'nationality', 'position', 'Current Club', 'league_name', 'league_nationality', 'season', 'appearances', 'minutes_played', 'goals', 'goals_per_90',
        'min_per_goal', 'xg', 'xg_per_90', 'npxg', 'npxg_per_90', 'assists', 'assists_per_90', 'min_per_assist',
        'xa', 'xa_per_90', 'goals_involved_per_90', 'avg_rating_', 'rank_in_league_top_defenders', 'rank_in_league_top_midfielders', 'rank_in_league_top_attackers',
        'shots', 'shots_per_90', 'shots_on_target', 'shots_on_target_per_90', 'shot_accuraccy_percentage', 'passes', 'passes_per_90',
        'passes_completed', 'passes_completed_per_90', 'pass_completion_rate', 'key_passes', 'key_passes_per_90', 'crosses',
        'crosses_per_90', 'accurate_crosses', 'accurate_crosses_per_90', 'cross_completion_rate', 'dribbles', 'dribbles_per_90',
        'dribbles_successful', 'dribbles_successful_per_90', 'dribbled_past', 'dribbled_past_per_90', 'tackles', 'tackles_per_90',
        'interceptions', 'interceptions_per_90', 'blocks', 'blocks_per_90', 'clearances', 'clearances_per_90', 'aerial_duels_won',
        'aerial_duels_won_per_90', 'duels', 'duels_per_90', 'duels_won', 'duels_won_per_90', 'clean_sheets', 'conceded_goals',
        'conceded_per_90', 'saves', 'saves_per_90', 'shots_faced', 'shots_faced_per_90', 'save_percentage', 'punches', 'punches_per_90', 'pens_saved'
]

# --- Nové statistiky (přidané navíc k notebooku, na konec tabulky) ---------
# sloupec v CSV -> název v db.xlsx
NOVE_STATISTIKY = {
    'fouls_drawn_total_overall': 'fouls_drawn',
    'fouls_drawn_per_90_overall': 'fouls_drawn_per_90',
    'dispossesed_total_overall': 'dispossessed',
    'dispossesed_per_90_overall': 'dispossessed_per_90',
    'duels_won_percentage_overall': 'duels_won_percentage',
    'dribbles_successful_percentage_overall': 'dribbles_successful_percentage',
    'yellow_cards_overall': 'yellow_cards',
}
# Žluté karty na 90 minut v CSV nejsou (je tam jen "karty/90" včetně červených),
# proto je dopočítáme z počtu žlutých a odehraných minut.

# FootyStats u ligy, kde danou statistiku nesleduje, nedává prázdné buňky,
# ale nuly. U těchto sloupců proto nuly celé ligy přepíšeme na prázdno,
# aby hráči z takové ligy nevypadali třeba jako "nikdy neztratí míč".
NULY_JAKO_CHYBEJICI = [
    'dribbled_past', 'dribbled_past_per_90',
    'fouls_drawn', 'fouls_drawn_per_90', 'dispossessed', 'dispossessed_per_90',
    'duels_won_percentage', 'dribbles_successful_percentage',
    'yellow_cards', 'yellow_cards_per_90',
]
PODIL_NUL_BEZ_DAT = 0.9   # liga, kde má nulu aspoň 90 % hráčů s 300+ minutami = liga bez dat


def nacti_ligy():
    """Načte seznam lig z python/ligy.csv (oddělovač středník, jde otevřít v Excelu)."""
    try:
        ligy = pd.read_csv(LIGY_SOUBOR, sep=";", encoding="utf-8-sig", dtype=str)
    except UnicodeDecodeError:
        # Český Excel ukládá CSV ve starším kódování (cp1250), i to zvládneme.
        ligy = pd.read_csv(LIGY_SOUBOR, sep=";", encoding="cp1250", dtype=str)
    ligy = ligy.dropna(subset=["soubor"])
    ligy["soubor"] = ligy["soubor"].str.strip().str.lower()
    return ligy


def rozloz_nazev(soubor: Path):
    """Z názvu CSV vytáhne ligu a sezónu. Vrátí None, když to není CSV hráčů z FootyStats."""
    m = VZOR_NAZVU.match(soubor.name)
    if not m:
        return None
    return m.group("liga").lower(), int(m.group("od")), int(m.group("do"))


def je_platne_csv(f: Path):
    """Vrátí True, když jde CSV přečíst a má hráče (stažení se nepokazilo)."""
    try:
        d = pd.read_csv(f, usecols=["full_name"])
        return len(d) > 0
    except Exception:
        return False


def importuj_ze_stazenych(znamé_ligy):
    """Přesune nová CSV ze Stažených souborů do data/footystats_csv/."""
    print(f"\n=== 1) Hledám nová CSV ve složce {STAZENE}")
    CSV_DIR.mkdir(parents=True, exist_ok=True)

    # Pro každou ligu vezmeme jen nejnovější stažený soubor (podle času stažení).
    nalezene = {}
    nezname = []
    for f in STAZENE.glob("*.csv"):
        info = rozloz_nazev(f)
        if not info:
            continue
        liga = info[0]
        if liga not in znamé_ligy:
            nezname.append(f.name)
            continue
        if not je_platne_csv(f):
            # Prázdný nebo poškozený soubor (nepovedené stažení) nepřebíráme,
            # zůstane platit starší verze ligy v projektu.
            print(f"  ! {f.name} je prázdný nebo poškozený, nepřebírám ho (zkus ho stáhnout znovu).")
            continue
        if liga not in nalezene or f.stat().st_mtime > nalezene[liga].stat().st_mtime:
            nalezene[liga] = f

    if nezname:
        print("  ! Tyto soubory patří lize, která není v python/ligy.csv, nechávám je ve Stažených:")
        for n in nezname:
            print(f"     - {n}")

    if not nalezene:
        print("  Žádná nová CSV nenalezena, použiju ta, která už jsou v projektu.")
        return

    datum = datetime.now().strftime("%Y-%m-%d_%H%M")
    for liga, novy in sorted(nalezene.items()):
        # Starší CSV stejné ligy odsuneme do archivu (nic se nemaže).
        for stary in CSV_DIR.glob("*.csv"):
            info = rozloz_nazev(stary)
            if info and info[0] == liga:
                ARCHIV_DIR.mkdir(parents=True, exist_ok=True)
                shutil.move(str(stary), str(ARCHIV_DIR / f"{datum}__{stary.name}"))
        # Nový soubor přesuneme do projektu (bez případného " (1)" v názvu).
        cisty_nazev = re.sub(r" \(\d+\)(?=\.csv$)", "", novy.name)
        shutil.move(str(novy), str(CSV_DIR / cisty_nazev))
        print(f"  + {cisty_nazev}")

    # Ostatní kopie stejných lig ve Stažených (např. "(1)") necháváme být.
    print(f"  Převzato {len(nalezene)} CSV.")


def najdi_csv(liga):
    """Najde v data/footystats_csv/ CSV dané ligy (při více sezónách vezme nejnovější)."""
    kandidati = []
    for f in CSV_DIR.glob("*.csv"):
        info = rozloz_nazev(f)
        if info and info[0] == liga:
            kandidati.append((info[2], info[1], f.stat().st_mtime, f))
    if not kandidati:
        return None
    return max(kandidati)[3]


def pocty_v_minule_db():
    """Počty hráčů po ligách v současném db.xlsx (pro kontrolu, že nic nespadlo)."""
    if not VYSTUP.exists():
        return {}
    stara = pd.read_excel(VYSTUP, usecols=["league_name"])
    return stara["league_name"].value_counts().to_dict()


def sestav_databazi(ligy):
    print("\n=== 2) Skládám databázi z lig v python/ligy.csv")
    datasets = []
    prehled = []   # řádky pro závěrečný přehled
    for _, r in ligy.iterrows():
        f = najdi_csv(r["soubor"])
        if f is None:
            prehled.append((r["league_name"], None, None))
            continue
        try:
            d = pd.read_csv(f)
        except Exception as e:
            print(f"  ! {f.name} nejde přečíst ({e}), ligu přeskakuji.")
            prehled.append((r["league_name"], None, None))
            continue
        # Přidání sloupce s názvem a národností ligy (stejně jako v notebooku).
        d[['league_name', 'league_nationality']] = [r["league_name"], r["league_nationality"]]
        datasets.append(d)
        stari_dnu = (datetime.now() - datetime.fromtimestamp(f.stat().st_mtime)).days
        prehled.append((r["league_name"], f, stari_dnu))

    if not datasets:
        print("  ! Nenašel jsem žádné CSV. Končím, db.xlsx nechávám beze změny.")
        sys.exit(1)

    # Spojení do databáze
    df = pd.concat(datasets, ignore_index=True)

    # Kdyby CSV některé ligy neobsahovalo nějaký sloupec (malé ligy mívají
    # méně statistik), doplníme ho prázdný, ať skript nespadne.
    vsechny_cols = COLS + list(NOVE_STATISTIKY)
    chybejici = [c for c in vsechny_cols if c not in df.columns]
    if chybejici:
        print(f"  ! V CSV chybí sloupce, doplňuji je prázdné: {', '.join(chybejici)}")
        for c in chybejici:
            df[c] = pd.NA

    # Filtr a změna pořadí požadovaných sloupců
    df = df[vsechny_cols]
    # Přejmenování sloupců
    df.columns = NOVE_NAZVY + list(NOVE_STATISTIKY.values())

    # Žluté karty na 90 minut
    minuty = pd.to_numeric(df['minutes_played'], errors='coerce')
    zlute = pd.to_numeric(df['yellow_cards'], errors='coerce')
    df['yellow_cards_per_90'] = (zlute / minuty * 90).where(minuty > 0).round(2)

    # % úspěšných driblinků nedává smysl u hráče, který žádný driblink nezkusil
    driblinky = pd.to_numeric(df['dribbles'], errors='coerce')
    df.loc[~(driblinky > 0), 'dribbles_successful_percentage'] = pd.NA

    # Ligy bez dat (samé nuly) -> prázdné buňky
    hlavni = df[minuty >= 300]
    for c in NULY_JAKO_CHYBEJICI:
        hodnoty = pd.to_numeric(hlavni[c], errors='coerce').fillna(0)
        podil_nul = (hodnoty == 0).groupby(hlavni['league_name']).mean()
        bez_dat = podil_nul[podil_nul >= PODIL_NUL_BEZ_DAT].index
        df.loc[df['league_name'].isin(bez_dat), c] = pd.NA
    # Smazání řádků bez jména hráče a duplicit
    df = df.dropna(subset=['player_name'])
    df = df.drop_duplicates()
    return df, prehled


def vypis_prehled(df, prehled, minule):
    """Vypíše tabulku lig a vrátí seznam problémů (ligy, kde výrazně ubylo hráčů)."""
    print("\n=== 3) Přehled lig")
    nove = df["league_name"].value_counts().to_dict()
    problemy = []
    print(f"  {'Liga':<34} {'Hráčů':>6} {'Minule':>7}  {'CSV staré':>10}")
    print("  " + "-" * 64)
    for nazev, f, stari in prehled:
        pred = minule.get(nazev)
        pred_txt = str(pred) if pred is not None else "-"
        if f is None:
            print(f"  {nazev:<34} {'-':>6} {pred_txt:>7}  {'CHYBÍ CSV':>10}")
            if pred:
                problemy.append(f"{nazev}: CSV chybí, ale v minulé databázi liga byla ({pred} hráčů)")
            continue
        ted = nove.get(nazev, 0)
        stari_txt = "dnes" if stari == 0 else f"{stari} dní"
        print(f"  {nazev:<34} {ted:>6} {pred_txt:>7}  {stari_txt:>10}")
        if pred and ted < pred * MIN_PODIL_HRACU:
            problemy.append(f"{nazev}: hráčů ubylo z {pred} na {ted}")
    print("  " + "-" * 64)
    print(f"  {'Celkem':<34} {len(df):>6} {sum(minule.values()) if minule else '-':>7}")
    return problemy


def main():
    parser = argparse.ArgumentParser(description="Sestaví data/db.xlsx z CSV FootyStats.")
    parser.add_argument("--import", dest="importovat", action="store_true",
                        help="nejdřív převezmi nová CSV ze složky Stažené soubory")
    parser.add_argument("--vystup", type=Path, default=VYSTUP,
                        help="kam uložit výsledek (výchozí data/db.xlsx)")
    args = parser.parse_args()

    ligy = nacti_ligy()
    if args.importovat:
        importuj_ze_stazenych(set(ligy["soubor"]))

    minule = pocty_v_minule_db()
    df, prehled = sestav_databazi(ligy)
    problemy = vypis_prehled(df, prehled, minule)

    if problemy:
        print("\n!!! Něco nesedí, db.xlsx NEUKLÁDÁM:")
        for p in problemy:
            print(f"   - {p}")
        print("Zkontroluj stažená CSV a spusť to znovu.")
        sys.exit(2)

    df.to_excel(args.vystup)
    print(f"\nHotovo: uloženo {len(df)} hráčů do {args.vystup}")


if __name__ == "__main__":
    main()
