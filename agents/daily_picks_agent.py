"""LyDia Daily Picks Agent.

This script is designed for GitHub Actions. It builds a daily MLB preview using:
- MLB public Stats API for schedule and standings
- The Odds API for market prices, if ODDS_API_KEY is saved as a GitHub secret
- Optional public competitor signal pages configured in data/config/competitor_sources.json
- Optional OpenAI writeup generation, if OPENAI_API_KEY is saved as a GitHub secret

It writes:
- data/daily/YYYY-MM-DD.json
- previews/YYYY-MM-DD.html
- previews/index.html
- index.html featured status block
"""

from __future__ import annotations

import csv
import datetime as dt
import html
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PREVIEWS = ROOT / "previews"
SETTINGS_PATH = DATA / "config" / "settings.json"
RESULTS_PATH = DATA / "results" / "results.json"

PYTH_EXP = 1.83
FORM_WEIGHT = 0.25
HFA = 54 / 46
MIN_EDGE_DEFAULT = 0.03
MAX_PICKS_DEFAULT = 3

TEAM_NAME_FIX = {
    "Oakland Athletics": "Athletics",
}


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def today_et() -> dt.date:
    # GitHub runner timezone may be UTC. The workflow is scheduled in America/New_York.
    # For this site, local date from the runner is acceptable after the scheduled run time.
    return dt.datetime.now().date()


def moneyline_to_prob(am: float) -> float:
    am = float(am)
    return 100 / (am + 100) if am > 0 else abs(am) / (abs(am) + 100)


def moneyline_to_decimal(am: float) -> float:
    am = float(am)
    return 1 + am / 100 if am > 0 else 1 + 100 / abs(am)


def prob_to_moneyline(p: float) -> int:
    p = max(0.001, min(0.999, p))
    if p >= 0.5:
        return round(-100 * p / (1 - p))
    return round(100 * (1 - p) / p)


def fmt_am(x: Optional[float]) -> str:
    if x is None:
        return "N/A"
    x = round(float(x))
    return f"+{x}" if x > 0 else str(x)


def fmt_pct(p: Optional[float]) -> str:
    if p is None:
        return "N/A"
    return f"{p * 100:.1f}%"


def pythag(rs: float, ra: float) -> float:
    if not rs or not ra:
        return 0.5
    return (rs ** PYTH_EXP) / ((rs ** PYTH_EXP) + (ra ** PYTH_EXP))


def log5_home(home_strength: float, away_strength: float) -> float:
    denom = home_strength * (1 - away_strength) + away_strength * (1 - home_strength)
    raw = 0.5 if denom == 0 else (home_strength * (1 - away_strength)) / denom
    odds = (raw / max(0.001, 1 - raw)) * HFA
    return odds / (1 + odds)


def fetch_json(url: str, timeout: int = 20) -> Any:
    res = requests.get(url, timeout=timeout, headers={"User-Agent": "LyDiaPicksBot/1.0"})
    res.raise_for_status()
    return res.json()


def fetch_schedule(date_str: str) -> List[Dict[str, Any]]:
    url = f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date_str}&hydrate=probablePitcher,linescore"
    data = fetch_json(url)
    dates = data.get("dates") or []
    return (dates[0].get("games") if dates else []) or []


def fetch_standings(season: int) -> Dict[int, Dict[str, Any]]:
    url = f"https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season={season}&standingsTypes=regularSeason"
    data = fetch_json(url)
    strength: Dict[int, Dict[str, Any]] = {}
    for rec in data.get("records", []):
        for team in rec.get("teamRecords", []):
            team_id = team["team"]["id"]
            splits = ((team.get("records") or {}).get("splitRecords") or [])
            last10 = next((s for s in splits if s.get("type") == "lastTen"), None)
            pyth = pythag(float(team.get("runsScored") or 0), float(team.get("runsAllowed") or 0))
            if last10:
                form = last10.get("wins", 0) / max(1, last10.get("wins", 0) + last10.get("losses", 0))
            else:
                form = 0.5
            blended = (1 - FORM_WEIGHT) * pyth + FORM_WEIGHT * form
            strength[team_id] = {
                "name": team["team"]["name"],
                "wins": team.get("wins", 0),
                "losses": team.get("losses", 0),
                "runs_scored": team.get("runsScored", 0),
                "runs_allowed": team.get("runsAllowed", 0),
                "pythag": pyth,
                "last10_form": form,
                "strength": max(0.05, min(0.95, blended)),
            }
    return strength


def fetch_odds_map(api_key: str) -> Dict[str, Any]:
    if not api_key:
        return {}
    url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/"
    params = {"apiKey": api_key, "regions": "us", "markets": "h2h", "oddsFormat": "american"}
    try:
        res = requests.get(url, params=params, timeout=25, headers={"User-Agent": "LyDiaPicksBot/1.0"})
        res.raise_for_status()
        events = res.json()
    except Exception as exc:
        print(f"Odds unavailable: {exc}")
        return {}

    out: Dict[str, Any] = {}
    for ev in events:
        away, home = ev.get("away_team"), ev.get("home_team")
        rows = []
        for book in ev.get("bookmakers", []):
            market = next((m for m in book.get("markets", []) if m.get("key") == "h2h"), None)
            if not market:
                continue
            o_away = next((o for o in market.get("outcomes", []) if o.get("name") == away), None)
            o_home = next((o for o in market.get("outcomes", []) if o.get("name") == home), None)
            if o_away and o_home:
                rows.append({"book": book.get("title"), "away": o_away["price"], "home": o_home["price"]})
        if not rows:
            continue
        avg_away = sum(moneyline_to_prob(r["away"]) for r in rows) / len(rows)
        avg_home = sum(moneyline_to_prob(r["home"]) for r in rows) / len(rows)
        total = avg_away + avg_home
        best_away = max(rows, key=lambda r: moneyline_to_decimal(r["away"]))
        best_home = max(rows, key=lambda r: moneyline_to_decimal(r["home"]))
        key = f"{away}@{home}"
        out[key] = {
            "away": away,
            "home": home,
            "market_away": avg_away / total,
            "market_home": avg_home / total,
            "best_away": best_away["away"],
            "best_home": best_home["home"],
            "best_away_book": best_away.get("book"),
            "best_home_book": best_home.get("book"),
            "books": len(rows),
        }
    return out


def team_key(name: str) -> str:
    return TEAM_NAME_FIX.get(name, name)


def compute_games(games: List[Dict[str, Any]], strength: Dict[int, Dict[str, Any]], odds_map: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = []
    for g in games:
        if g.get("status", {}).get("abstractGameState") != "Preview":
            continue
        away = g["teams"]["away"]
        home = g["teams"]["home"]
        away_id, home_id = away["team"]["id"], home["team"]["id"]
        away_name, home_name = away["team"]["name"], home["team"]["name"]
        a_strength = strength.get(away_id, {}).get("strength", 0.5)
        h_strength = strength.get(home_id, {}).get("strength", 0.5)
        model_home = log5_home(h_strength, a_strength)
        model_away = 1 - model_home
        odds = odds_map.get(f"{team_key(away_name)}@{team_key(home_name)}") or odds_map.get(f"{away_name}@{home_name}")
        market_away = odds.get("market_away") if odds else None
        market_home = odds.get("market_home") if odds else None
        edge_away = model_away - market_away if market_away is not None else None
        edge_home = model_home - market_home if market_home is not None else None
        rows.append({
            "game_pk": g.get("gamePk"),
            "date_time": g.get("gameDate"),
            "venue": (g.get("venue") or {}).get("name", ""),
            "away": away_name,
            "home": home_name,
            "away_record": f"{away.get('leagueRecord', {}).get('wins', 0)}-{away.get('leagueRecord', {}).get('losses', 0)}",
            "home_record": f"{home.get('leagueRecord', {}).get('wins', 0)}-{home.get('leagueRecord', {}).get('losses', 0)}",
            "model_away": model_away,
            "model_home": model_home,
            "market_away": market_away,
            "market_home": market_home,
            "edge_away": edge_away,
            "edge_home": edge_home,
            "best_away": odds.get("best_away") if odds else None,
            "best_home": odds.get("best_home") if odds else None,
            "best_away_book": odds.get("best_away_book") if odds else None,
            "best_home_book": odds.get("best_home_book") if odds else None,
            "books": odds.get("books") if odds else 0,
        })
    return rows


def choose_picks(rows: List[Dict[str, Any]], min_edge: float, max_picks: int) -> List[Dict[str, Any]]:
    candidates = []
    for r in rows:
        for side in ["away", "home"]:
            edge = r.get(f"edge_{side}")
            price = r.get(f"best_{side}")
            if edge is None or price is None:
                continue
            if edge >= min_edge:
                team = r[side]
                candidates.append({
                    "game_pk": r["game_pk"],
                    "matchup": f"{r['away']} @ {r['home']}",
                    "pick": f"{team} ML",
                    "team": team,
                    "side": side,
                    "odds": price,
                    "book": r.get(f"best_{side}_book"),
                    "model_probability": r.get(f"model_{side}"),
                    "market_probability": r.get(f"market_{side}"),
                    "edge": edge,
                    "confidence": "High" if edge >= 0.06 else "Medium" if edge >= 0.04 else "Light",
                    "status": "pending",
                    "result": None,
                    "unit_size": 1.0,
                })
    candidates.sort(key=lambda x: x["edge"], reverse=True)
    return candidates[:max_picks]


def read_manual_competitor_signals(date_str: str) -> List[Dict[str, str]]:
    path = DATA / "config" / "manual_competitor_signals.csv"
    if not path.exists():
        return []
    out = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("date") == date_str:
                out.append(row)
    return out


def fetch_public_competitor_notes() -> List[Dict[str, str]]:
    config = read_json(DATA / "config" / "competitor_sources.json", {"sources": []})
    notes = []
    for source in config.get("sources", []):
        name = source.get("name", "Unknown")
        url = source.get("url")
        if not url:
            continue
        try:
            res = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0 LyDiaResearchBot/1.0"})
            if not res.ok:
                notes.append({"source": name, "url": url, "status": f"unavailable HTTP {res.status_code}", "summary": ""})
                continue
            soup = BeautifulSoup(res.text, "html.parser")
            text = " ".join(soup.get_text(" ").split())
            text = re.sub(r"\s+", " ", text)[:1200]
            notes.append({"source": name, "url": url, "status": "public page fetched", "summary": text})
        except Exception as exc:
            notes.append({"source": name, "url": url, "status": f"unavailable: {exc}", "summary": ""})
    return notes


def openai_writeup(date_str: str, games: List[Dict[str, Any]], picks: List[Dict[str, Any]], competitor_notes: List[Dict[str, str]]) -> Optional[str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        prompt = {
            "date": date_str,
            "picks": picks,
            "top_games": games[:10],
            "competitor_notes": competitor_notes[:6],
            "rules": [
                "Write original LyDia analysis only.",
                "Use competitor/public expert information only as research signals.",
                "Do not copy competitor language.",
                "No lock language, no guaranteed profit, no free money.",
                "Use plain English and keep it concise.",
            ],
        }
        resp = client.responses.create(
            model="gpt-4.1-mini",
            input="Create a concise daily MLB preview for LyDia from this JSON. Return HTML paragraphs and bullet lists only, no markdown fences.\n" + json.dumps(prompt, ensure_ascii=False),
        )
        return getattr(resp, "output_text", None) or None
    except Exception as exc:
        print(f"OpenAI writeup skipped: {exc}")
        return None


def default_writeup(date_str: str, picks: List[Dict[str, Any]], has_odds: bool) -> str:
    if not has_odds:
        return "<p>Today’s slate loaded, but no Odds API key was available. LyDia can show the schedule and model structure, but official value picks require market prices.</p>"
    if not picks:
        return "<p>Today’s slate did not produce an official LyDia play at the current edge threshold. No pick is better than forcing a weak number.</p>"
    parts = ["<p>Today’s official LyDia card is built from model probability, no-vig market probability, price quality, and matchup context.</p>"]
    parts.append("<ul>")
    for p in picks:
        parts.append(f"<li><strong>{html.escape(p['pick'])}</strong> at {fmt_am(p['odds'])}, model {fmt_pct(p['model_probability'])}, market {fmt_pct(p['market_probability'])}, edge {fmt_pct(p['edge'])}.</li>")
    parts.append("</ul>")
    return "\n".join(parts)


def render_preview_html(date_str: str, payload: Dict[str, Any], writeup_html: str) -> str:
    picks = payload["official_picks"]
    rows_html = ""
    if picks:
        for p in picks:
            rows_html += f"""
            <tr>
              <td>{html.escape(p['matchup'])}</td>
              <td><strong>{html.escape(p['pick'])}</strong></td>
              <td class="num">{fmt_am(p['odds'])}</td>
              <td class="num">{fmt_pct(p['model_probability'])}</td>
              <td class="num">{fmt_pct(p['market_probability'])}</td>
              <td class="num">{fmt_pct(p['edge'])}</td>
              <td>{html.escape(p['confidence'])}</td>
            </tr>"""
    else:
        rows_html = "<tr><td colspan='7' class='dim'>No official picks published for this slate.</td></tr>"

    comp_rows = ""
    for note in payload.get("competitor_notes", [])[:8]:
        comp_rows += f"<tr><td>{html.escape(note.get('source',''))}</td><td>{html.escape(note.get('status',''))}</td><td><a href='{html.escape(note.get('url',''))}'>Source</a></td></tr>"
    if not comp_rows:
        comp_rows = "<tr><td colspan='3' class='dim'>No competitor signals recorded.</td></tr>"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LyDia Preview | {date_str}</title>
<meta name="description" content="LyDia daily MLB preview for {date_str}.">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<nav id="nav"></nav>
<main>
  <p class="eyebrow">Daily preview</p>
  <h1>LyDia MLB Preview: {date_str}</h1>
  <p class="subtitle">Generated by the LyDia daily picks agent. Picks are analysis and education only. No outcome is guaranteed.</p>
  <div class="notice warn">Only bet what you can afford to lose. If gambling stops being fun, call 1-800-GAMBLER.</div>

  <h2>Official card</h2>
  <div class="card"><table><thead><tr><th>Game</th><th>Pick</th><th class="num">Odds</th><th class="num">Model</th><th class="num">Market</th><th class="num">Edge</th><th>Confidence</th></tr></thead><tbody>{rows_html}</tbody></table></div>

  <h2>LyDia notes</h2>
  <div class="card">{writeup_html}</div>

  <h2>Public research signals</h2>
  <div class="card"><table><thead><tr><th>Source</th><th>Status</th><th>Link</th></tr></thead><tbody>{comp_rows}</tbody></table></div>
</main>
<footer id="footer"></footer>
<script src="../js/app.js"></script>
<script>renderNav("previews/"); renderFooter();</script>
</body>
</html>"""


def render_previews_index(date_str: str) -> str:
    previews = sorted(PREVIEWS.glob("20*.html"), reverse=True)
    links = "".join([f"<li><a href=\"/previews/{p.name}\">{p.stem}</a></li>" for p in previews[:60]])
    if not links:
        links = "<li class='dim'>No previews published yet.</li>"
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Previews | LyDia</title><link rel="stylesheet" href="../css/style.css"></head>
<body><nav id="nav"></nav><main><p class="eyebrow">Daily archive</p><h1>Previews</h1><p class="subtitle">Archived LyDia daily previews.</p><div class="card"><ul>{links}</ul></div></main><footer id="footer"></footer><script src="../js/app.js"></script><script>renderNav("previews/"); renderFooter();</script></body></html>"""


def update_home(date_str: str, picks: List[Dict[str, Any]]) -> None:
    path = ROOT / "index.html"
    if not path.exists():
        return
    if picks:
        status = f"<p><strong>Latest preview:</strong> <a href=\"/previews/{date_str}.html\">{date_str}</a></p><p><strong>Official picks:</strong> {len(picks)} published.</p><p><strong>Top play:</strong> {html.escape(picks[0]['pick'])} at {fmt_am(picks[0]['odds'])}.</p>"
    else:
        status = f"<p><strong>Latest preview:</strong> <a href=\"/previews/{date_str}.html\">{date_str}</a></p><p><strong>Official picks:</strong> No official play at current threshold.</p><p><strong>Record:</strong> See results page.</p>"
    content = path.read_text(encoding="utf-8")
    new_content = re.sub(r"<h3>Today’s status</h3>.*?<p><a class=\"btn blue\" href=\"/membership.html\">Join LyDia</a></p>", f"<h3>Today’s status</h3>\n      {status}\n      <p><a class=\"btn blue\" href=\"/membership.html\">Join LyDia</a></p>", content, flags=re.S)
    path.write_text(new_content, encoding="utf-8")


def main() -> None:
    settings = read_json(SETTINGS_PATH, {})
    date = today_et()
    date_str = date.isoformat()
    season = date.year if date.month >= 3 else date.year - 1

    print(f"Running LyDia daily agent for {date_str}")
    games_raw = fetch_schedule(date_str)
    strength = fetch_standings(season)
    odds_key = os.getenv("ODDS_API_KEY", "").strip()
    odds_map = fetch_odds_map(odds_key)
    game_rows = compute_games(games_raw, strength, odds_map)
    min_edge = float(settings.get("min_edge_for_pick", MIN_EDGE_DEFAULT))
    max_picks = int(settings.get("max_official_picks", MAX_PICKS_DEFAULT))
    official_picks = choose_picks(game_rows, min_edge, max_picks)

    manual_signals = read_manual_competitor_signals(date_str)
    competitor_notes = fetch_public_competitor_notes()
    for s in manual_signals:
        competitor_notes.insert(0, {"source": s.get("source", "Manual signal"), "url": s.get("url", ""), "status": f"manual public signal: {s.get('public_pick','')}", "summary": s.get("reason_short", "")})

    payload = {
        "date": date_str,
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
        "brand": settings.get("brand", "LyDia"),
        "odds_available": bool(odds_map),
        "games": game_rows,
        "official_picks": official_picks,
        "competitor_notes": competitor_notes,
        "disclaimer": "Analysis and education only. No pick is guaranteed. Bet responsibly.",
    }

    writeup = openai_writeup(date_str, game_rows, official_picks, competitor_notes)
    if not writeup:
        writeup = default_writeup(date_str, official_picks, bool(odds_map))

    write_json(DATA / "daily" / f"{date_str}.json", payload)
    write_json(DATA / "daily" / "latest.json", payload)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    (PREVIEWS / f"{date_str}.html").write_text(render_preview_html(date_str, payload, writeup), encoding="utf-8")
    (PREVIEWS / "index.html").write_text(render_previews_index(date_str), encoding="utf-8")
    update_home(date_str, official_picks)
    print(f"Generated preview with {len(official_picks)} official picks.")


if __name__ == "__main__":
    main()
