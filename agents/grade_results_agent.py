"""LyDia Grade Results Agent.

Grades pending moneyline picks from previous daily JSON files when games are final.
"""

from __future__ import annotations

import datetime as dt
import html
import json
from pathlib import Path
from typing import Any, Dict, List

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RESULTS_PATH = DATA / "results" / "results.json"


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


def fetch_schedule(date_str: str) -> List[Dict[str, Any]]:
    url = f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date_str}&hydrate=linescore"
    res = requests.get(url, timeout=20, headers={"User-Agent": "LyDiaResultsBot/1.0"})
    res.raise_for_status()
    data = res.json()
    dates = data.get("dates") or []
    return (dates[0].get("games") if dates else []) or []


def moneyline_profit(odds: float, stake: float = 1.0) -> float:
    odds = float(odds)
    return stake * (odds / 100) if odds > 0 else stake * (100 / abs(odds))


def grade_pick(pick: Dict[str, Any], games_by_pk: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    g = games_by_pk.get(int(pick["game_pk"]))
    if not g or g.get("status", {}).get("abstractGameState") != "Final":
        return pick
    away = g["teams"]["away"]
    home = g["teams"]["home"]
    away_score = away.get("score")
    home_score = home.get("score")
    if away_score is None or home_score is None:
        return pick
    winner = away["team"]["name"] if away_score > home_score else home["team"]["name"]
    pick_team = pick.get("team")
    won = pick_team == winner
    units = moneyline_profit(pick.get("odds", -110), 1.0) if won else -1.0
    pick = dict(pick)
    pick.update({
        "status": "graded",
        "result": "win" if won else "loss",
        "winner": winner,
        "final_score": f"{away['team']['name']} {away_score}, {home['team']['name']} {home_score}",
        "units": round(units, 2),
    })
    return pick


def render_results_html(results: Dict[str, Any]) -> str:
    rec = results.get("record", {})
    wins = rec.get("wins", 0)
    losses = rec.get("losses", 0)
    pushes = rec.get("pushes", 0)
    total = wins + losses
    win_rate = f"{(wins / total * 100):.1f}%" if total else "—%"
    day_rows = ""
    for day in results.get("days", [])[:90]:
        day_rows += f"<tr><td>{html.escape(day.get('date',''))}</td><td class='num'>{day.get('wins',0)}-{day.get('losses',0)}</td><td class='num'>{day.get('units',0):.2f}</td><td>{html.escape(str(day.get('picks','')))}</td></tr>"
    if not day_rows:
        day_rows = "<tr><td colspan='4' class='dim'>No graded slates yet.</td></tr>"
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Results | LyDia Public Pick Record</title><link rel="stylesheet" href="css/style.css"></head>
<body><nav id="nav"></nav><main><p class="eyebrow">Public record</p><h1>Results</h1><p class="subtitle">Every published pick is graded against final scores. Wins and losses stay visible.</p>
<div class="grid grid-4" style="margin-bottom:24px"><div class="card"><div class="dim small">RECORD</div><div class="big-num">{wins}-{losses}{('-' + str(pushes)) if pushes else ''}</div></div><div class="card"><div class="dim small">WIN RATE</div><div class="big-num">{win_rate}</div></div><div class="card"><div class="dim small">UNITS, FLAT 1U</div><div class="big-num">{rec.get('units',0):.2f}</div></div><div class="card"><div class="dim small">DAYS TRACKED</div><div class="big-num">{rec.get('days_tracked',0)}</div></div></div>
<div class="card"><table><thead><tr><th>Date</th><th class="num">Record</th><th class="num">Units</th><th>Picks</th></tr></thead><tbody>{day_rows}</tbody></table></div></main><footer id="footer"></footer><script src="js/app.js"></script><script>renderNav("results.html"); renderFooter();</script></body></html>"""


def main() -> None:
    results = read_json(RESULTS_PATH, {"record": {"wins": 0, "losses": 0, "pushes": 0, "units": 0.0, "days_tracked": 0}, "days": [], "picks": []})
    seen_ids = {p.get("id") for p in results.get("picks", []) if p.get("id")}

    daily_files = sorted((DATA / "daily").glob("20*.json"))
    changed = False
    for f in daily_files:
        daily = read_json(f, {})
        date_str = daily.get("date") or f.stem
        try:
            games = fetch_schedule(date_str)
        except Exception as exc:
            print(f"Could not fetch schedule for {date_str}: {exc}")
            continue
        games_by_pk = {int(g["gamePk"]): g for g in games if g.get("gamePk")}
        updated_picks = []
        day_w = day_l = 0
        day_units = 0.0
        day_pick_names = []
        for idx, pick in enumerate(daily.get("official_picks", []), start=1):
            pick.setdefault("id", f"{date_str}-{idx}")
            graded = grade_pick(pick, games_by_pk)
            updated_picks.append(graded)
            if graded.get("status") == "graded":
                day_pick_names.append(graded.get("pick"))
                if graded.get("result") == "win":
                    day_w += 1
                elif graded.get("result") == "loss":
                    day_l += 1
                day_units += float(graded.get("units", 0))
                if graded.get("id") not in seen_ids:
                    results.setdefault("picks", []).append(graded)
                    seen_ids.add(graded.get("id"))
                    changed = True
        daily["official_picks"] = updated_picks
        write_json(f, daily)
        if day_w or day_l:
            days = [d for d in results.get("days", []) if d.get("date") != date_str]
            days.insert(0, {"date": date_str, "wins": day_w, "losses": day_l, "units": round(day_units, 2), "picks": ", ".join(day_pick_names)})
            results["days"] = days
            changed = True

    wins = sum(1 for p in results.get("picks", []) if p.get("result") == "win")
    losses = sum(1 for p in results.get("picks", []) if p.get("result") == "loss")
    units = sum(float(p.get("units", 0)) for p in results.get("picks", []))
    results["record"] = {"wins": wins, "losses": losses, "pushes": 0, "units": round(units, 2), "days_tracked": len(results.get("days", []))}
    write_json(RESULTS_PATH, results)
    (ROOT / "results.html").write_text(render_results_html(results), encoding="utf-8")
    print(f"Results graded. Changed: {changed}. Record: {wins}-{losses}, units {units:.2f}")


if __name__ == "__main__":
    main()
