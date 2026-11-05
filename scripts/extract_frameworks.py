"""Extract compact technique catalogs from official MITRE data.

Usage:
  python3 -I scripts/extract_frameworks.py ATLAS-<ver>.yaml enterprise-attack.json src/library/frameworks

Sources:
  ATLAS:  https://github.com/mitre-atlas/atlas-data  (dist/v6/ATLAS-latest.yaml -> current release file)
  ATT&CK: https://github.com/mitre-attack/attack-stix-data (enterprise-attack/enterprise-attack.json)
"""
import json
import sys
from pathlib import Path

import yaml


def atlas(path):
    d = yaml.safe_load(Path(path).read_text())
    tactics = {tid: t["name"] for tid, t in d["tactics"].items()}
    achieves = {}
    for src, rels in d["relationships"].items():
        for r in rels.get("achieves", []) if isinstance(rels, dict) else []:
            achieves.setdefault(src, []).append(r["target"])
    items = []
    for tid, t in sorted(d["techniques"].items()):
        if t.get("deprecated") or t.get("object-type") != "technique":
            continue
        parent = tid.rsplit(".", 1)[0] if tid.count(".") == 2 else None
        tac = achieves.get(tid) or achieves.get(parent or "", [])
        name = t["name"]
        if parent:
            name = f"{d['techniques'][parent]['name']}: {name}"
        items.append({"id": tid, "name": name, "tactics": [tactics[x] for x in tac if x in tactics]})
    return {
        "framework": "MITRE ATLAS",
        "version": str(d["collection"]["version"]),
        "modified": str(d["collection"].get("modified-date", "")),
        "tactics": [{"id": k, "name": v} for k, v in sorted(tactics.items())],
        "items": items,
    }


def attack(path):
    d = json.loads(Path(path).read_text())
    objs = d["objects"]
    coll = next(o for o in objs if o["type"] == "x-mitre-collection")
    live = lambda o: not o.get("revoked") and not o.get("x_mitre_deprecated")
    tactics = {o["x_mitre_shortname"]: (o["external_references"][0]["external_id"], o["name"]) for o in objs if o["type"] == "x-mitre-tactic" and live(o)}
    techs = {}
    for o in objs:
        if o["type"] != "attack-pattern" or not live(o):
            continue
        ext = next(r["external_id"] for r in o["external_references"] if r.get("source_name") == "mitre-attack")
        techs[ext] = {
            "name": o["name"],
            "tactics": [tactics[p["phase_name"]][1] for p in o.get("kill_chain_phases", []) if p["phase_name"] in tactics],
        }
    items = []
    for tid in sorted(techs):
        t = techs[tid]
        parent = tid.split(".")[0] if "." in tid else None
        name = f"{techs[parent]['name']}: {t['name']}" if parent and parent in techs else t["name"]
        items.append({"id": tid, "name": name, "tactics": t["tactics"]})
    return {
        "framework": "MITRE ATT&CK Enterprise",
        "version": "v" + coll["x_mitre_version"],
        "modified": coll.get("modified", "")[:10],
        "tactics": [{"id": i, "name": n} for i, n in sorted(tactics.values())],
        "items": items,
    }


if __name__ == "__main__":
    atlas_path, attack_path, out = sys.argv[1:4]
    out = Path(out)
    for name, data in (("atlas.json", atlas(atlas_path)), ("attack.json", attack(attack_path))):
        (out / name).write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
        print(name, data["version"], len(data["items"]), "items")
