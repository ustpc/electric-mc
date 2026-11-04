# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml"]
# ///
"""Write the Electric MC roster.json from a cacm-opn-dashboard team.yaml.

The editorial matrix and the AE menu's roster sections (extension
lib/roster.ts) read a roster file the person loads in the Matrix window.
This reads the dashboard's team.yaml and the headshots beside it, maps each
member's roles to the matrix's four sections, embeds headshots as data URLs,
and writes the file. Its output names real editors, so write it under var/
(git-ignored), never into the repository.

Usage: uv run tools/roster-export/export_roster.py TEAM_YAML OUT_JSON
"""

import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

# Section order: a person goes in the first section any of their roles names.
SECTIONS = [
    ("leadership", {"editor_in_chief", "section_chair"}),
    ("column_heads", {"column_head"}),
    ("associate_editors", {"associate_editor"}),
    ("columnists", {"columnist"}),
]
LABEL = {"editor_in_chief": "Editor-in-Chief", "section_chair": "Co-Chair", "column_head": "Column Head", "columnist": "Columnist", "associate_editor": "Associate Editor"}


def initials(name: str) -> str:
    words = [w for w in name.replace("-", " ").split() if w[:1].isalpha()]
    return (words[0][0] + (words[-1][0] if len(words) > 1 else "")).upper() if words else ""


def portrait(folder: Path, image: str | None) -> str | None:
    if not image:
        return None
    path = folder / image
    if not path.is_file():
        return None
    kind = "png" if path.suffix.lower() == ".png" else "jpeg"
    return f"data:image/{kind};base64," + base64.b64encode(path.read_bytes()).decode()


def export(team_yaml: Path) -> dict:
    data = yaml.safe_load(team_yaml.read_text())
    section = data.get("section", "")
    team = data["team"]
    out = []
    for m in team:
        roles = m.get("roles") or []
        group = next((g for g, names in SECTIONS if names & set(roles)), "columnists")
        column = m.get("column")
        labels = []
        for r in roles:
            if r == "section_chair":
                labels.append(f"{section} Co-Chair")
            elif r in ("column_head", "columnist") and column:
                labels.append(f"{column} {LABEL[r]}")
            else:
                labels.append(LABEL.get(r, r))
        coheads = [o["id"] for o in team if o is not m and column and o.get("column") == column and "column_head" in (o.get("roles") or []) and "column_head" in roles]
        p = {
            "id": m["id"],
            "name": m["name"],
            "group": group,
            "roles": labels or ([m["masthead_role"]] if m.get("masthead_role") else []),
            "assignable": bool({"column_head", "associate_editor"} & set(roles)),
            "coheads": coheads,
            "affiliations": m.get("current_affiliations") or [],
            "mastheadAffiliation": m.get("masthead_affiliation"),
            "affiliationMismatch": m.get("affiliation_matches_masthead") is False,
            "expertise": m.get("expertise_summary") or "",
            "notes": m.get("notes"),
            "homepage": m.get("homepage"),
            "email": m.get("email"),
            "linkedin": m.get("linkedin"),
            "acmDl": m.get("acm_dl_author"),
            "portrait": portrait(team_yaml.parent, m.get("image")),
            "initials": initials(m["name"]),
        }
        out.append({k: v for k, v in p.items() if v is not None})
    return {
        "format": "electric-mc-roster",
        "version": 1,
        "section": section,
        "researchedOn": str(data.get("researched_on", "")),
        "mastheadSource": data.get("masthead_source"),
        "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "people": out,
    }


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__.split("Usage: ")[1])
    roster = export(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(json.dumps(roster, indent=1, ensure_ascii=False) + "\n")
    counts = {g: sum(p["group"] == g for p in roster["people"]) for g, _ in SECTIONS}
    print(f"wrote {sys.argv[2]}: {len(roster['people'])} people {counts}")


if __name__ == "__main__":
    main()
