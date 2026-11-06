"""Extract compliance catalogs from official NIST data.

Usage:
  python3 -I scripts/extract_compliance.py playbook.json csf.json sp80053.json src/library/frameworks

Sources:
  NIST AI RMF 1.0 (AI RMF Playbook):  https://airc.nist.gov/docs/playbook.json
  NIST CSF 2.0 (CPRT export):         https://csrc.nist.gov/extensions/nudp/services/json/nudp/framework/version/csf_2_0_0/export/json?element=all
  NIST SP 800-53 Rev 5 (OSCAL):       https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json
"""
import json
import re
import sys
from pathlib import Path


def ai_rmf(path):
    d = json.loads(Path(path).read_text())
    items = []
    for e in d:
        title = e["title"].strip()  # e.g. "GOVERN 1.1"
        items.append({"id": title, "name": " ".join(e["description"].split())})
    order = {"GOVERN": 0, "MAP": 1, "MEASURE": 2, "MANAGE": 3}
    items.sort(key=lambda i: (order[i["id"].split()[0]], [int(x) for x in i["id"].split()[1].split(".")]))
    return {"id": "nist-ai-rmf", "version": "1.0", "items": items}


def csf(path):
    d = json.loads(Path(path).read_text())["response"]["elements"]
    els = d["elements"]
    withdrawn = {e["element_identifier"][3:] for e in els if e["element_type"] == "withdraw_reason"}
    subs = [e for e in els if e["element_type"] == "subcategory" and e["element_identifier"] not in withdrawn]
    cats = {e["element_identifier"]: e["title"] for e in els if e["element_type"] == "category"}
    live_cats = {s["element_identifier"].split("-")[0] for s in subs}
    items = [{"id": c, "name": cats[c]} for c in cats if c in live_cats]
    items += [{"id": s["element_identifier"], "name": " ".join(s["text"].split())} for s in subs]
    fn = {"GV": 0, "ID": 1, "PR": 2, "DE": 3, "RS": 4, "RC": 5}
    items.sort(key=lambda i: (fn[i["id"][:2]], i["id"]))
    version = re.sub(r"\s+", " ", d["documents"][0]["version"]).replace("Version ", "")
    return {"id": "nist-csf", "version": version, "items": items}


def sp80053(path):
    cat = json.loads(Path(path).read_text())["catalog"]

    def label(c):
        for p in c.get("props", []):
            if p.get("name") == "label" and "class" not in p:
                return p["value"]
        return c["id"].upper()

    def withdrawn(c):
        return any(p.get("name") == "status" and p.get("value") == "withdrawn" for p in c.get("props", []))

    items = []
    for g in cat["groups"]:
        for c in g.get("controls", []):
            if withdrawn(c):
                continue
            items.append({"id": label(c), "name": c["title"]})
            for e in c.get("controls", []):
                if not withdrawn(e):
                    items.append({"id": label(e), "name": f"{c['title']}: {e['title']}"})
    return {"id": "nist-800-53", "version": f"Rev 5 ({cat['metadata']['version']})", "items": items}


if __name__ == "__main__":
    playbook, csf_path, sp_path, out = sys.argv[1:5]
    data = {"ai_rmf": ai_rmf(playbook), "csf": csf(csf_path), "sp800_53": sp80053(sp_path)}
    Path(out, "nist.json").write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
    for k, v in data.items():
        print(k, v["version"], len(v["items"]), "items")
