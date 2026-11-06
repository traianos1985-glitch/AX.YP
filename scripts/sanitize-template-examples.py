#!/usr/bin/env python3
"""Sanitize legacy personal examples, correct verified narcotics references, and resync embedded copies.

This file intentionally contains no original personal identifiers. Edits are
anchored to paragraph offsets from the verified main-branch template snapshot.
"""
import base64
import io
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
MARKER = ROOT / ".axyp-template-privacy-v1"
OPERATIONS = [
  {
    "path": "templates/camping/01_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ_ΜΕ_ΔΙΕΡΜΗΝΕΑ.docx",
    "paragraph_index": 7,
    "start": 61,
    "end": 67,
    "replacement": "{{person.fatherName}}"
  },
  {
    "path": "templates/camping/01_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ_ΜΕ_ΔΙΕΡΜΗΝΕΑ.docx",
    "paragraph_index": 26,
    "start": 278,
    "end": 297,
    "replacement": "ΟΝΟΜΑΤΕΠΩΝΥΜΟ ΔΙΚΗΓΟΡΟΥ"
  },
  {
    "path": "templates/camping/02_ΥΠΟΒΟΛΗ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 8,
    "start": 18,
    "end": 29,
    "replacement": "{{officerB.fullName}}"
  },
  {
    "path": "templates/camping/02_ΥΠΟΒΟΛΗ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 26,
    "start": 122,
    "end": 128,
    "replacement": "{{person.surname}}"
  },
  {
    "path": "templates/camping/02_ΥΠΟΒΟΛΗ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 26,
    "start": 296,
    "end": 316,
    "replacement": "{{person.address}}"
  },
  {
    "path": "templates/camping/02_ΥΠΟΒΟΛΗ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 27,
    "start": 376,
    "end": 383,
    "replacement": "{{person.fatherName}}"
  },
  {
    "path": "templates/camping/02_ΥΠΟΒΟΛΗ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 41,
    "start": 1,
    "end": 24,
    "replacement": "{{officerA.fullName}}"
  },
  {
    "path": "templates/camping/03_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx",
    "paragraph_index": 16,
    "start": 16,
    "end": 35,
    "replacement": "{{person.birthPlace}}"
  },
  {
    "path": "templates/camping/03_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx",
    "paragraph_index": 17,
    "start": 35,
    "end": 52,
    "replacement": "{{person.city}}"
  },
  {
    "path": "templates/camping/03_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx",
    "paragraph_index": 18,
    "start": 5,
    "end": 22,
    "replacement": "{{person.address}}"
  },
  {
    "path": "templates/camping/03_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx",
    "paragraph_index": 18,
    "start": 42,
    "end": 47,
    "replacement": "{{person.postalCode}}"
  },
  {
    "path": "templates/camping/03_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx",
    "paragraph_index": 32,
    "start": 0,
    "end": 17,
    "replacement": "{{officerB.fullName}}"
  },
  {
    "path": "templates/camping/04_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 15,
    "start": 323,
    "end": 330,
    "replacement": "{{person.fatherName}}"
  },
  {
    "path": "templates/camping/04_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 22,
    "start": 173,
    "end": 179,
    "replacement": "{{person.surname}}"
  },
  {
    "path": "templates/camping/04_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 22,
    "start": 347,
    "end": 367,
    "replacement": "{{person.address}}"
  },
  {
    "path": "templates/camping/04_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 22,
    "start": 783,
    "end": 790,
    "replacement": "{{person.fatherName}}"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 30,
    "start": 34,
    "end": 54,
    "replacement": "case.date"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 30,
    "start": 67,
    "end": 80,
    "replacement": "incident.time"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 30,
    "start": 90,
    "end": 105,
    "replacement": "case.location"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 30,
    "start": 122,
    "end": 136,
    "replacement": "case.notes"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 30,
    "start": 187,
    "end": 203,
    "replacement": "officerA.service"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 31,
    "start": 8,
    "end": 20,
    "replacement": "timeline.release.startTime"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 31,
    "start": 33,
    "end": 52,
    "replacement": "case.releaseDate"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 31,
    "start": 126,
    "end": 146,
    "replacement": "case.prosecutor"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1269,
    "end": 1285,
    "replacement": "{{owner.fullName}}"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1290,
    "end": 1300,
    "replacement": "{{owner.fatherName}}"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1309,
    "end": 1319,
    "replacement": "{{owner.motherName}}"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1325,
    "end": 1335,
    "replacement": "{{owner.birthDate}}"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1336,
    "end": 1384,
    "replacement": "στα {{owner.birthPlace}} κάτοικος {{owner.city}}"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1395,
    "end": 1428,
    "replacement": "{{owner.idNumber}}/{{owner.idDate}}/{{owner.idService}}"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1440,
    "end": 1449,
    "replacement": "{{owner.taxId}}"
  },
  {
    "path": "templates/noise/01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜΜΕΛΗΜΑΤΟΣ.docx",
    "paragraph_index": 8,
    "start": 1450,
    "end": 1470,
    "replacement": "{{owner.taxOffice}}"
  },
  {
    "path": "templates/dossiers/narcotics/02_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ.docx",
    "paragraph_index": 10,
    "start": 890,
    "end": 1010,
    "replacement": "του άρθρου ........ του Ν. 4139/2013 ‘‘Περί Εξαρτησιογόνων ουσιών’’"
  },
  {
    "path": "templates/dossiers/narcotics/03_ΕΚΘΕΣΗ_ΠΑΡΑΔΟΣΕΩΣ_ΚΑΙ_ΚΑΤΑΣΧΕΣΕΩΣ.docx",
    "paragraph_index": 7,
    "start": 471,
    "end": 591,
    "replacement": "του άρθρου ........ του Ν. 4139/2013 ‘‘Περί Εξαρτησιογόνων ουσιών’’"
  },
  {
    "path": "templates/dossiers/narcotics/06_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ_ΑΠΟΛΟΓΙΑ.docx",
    "paragraph_index": 11,
    "start": 65,
    "end": 185,
    "replacement": "του άρθρου ........ του Ν. 4139/2013 ‘‘Περί Εξαρτησιογόνων ουσιών’’"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 29,
    "start": 391,
    "end": 511,
    "replacement": "του άρθρου ........ του Ν. 4139/2013 ‘‘Περί Εξαρτησιογόνων ουσιών’’"
  },
  {
    "path": "templates/dossiers/narcotics/04_ΕΚΘΕΣΗ_ΓΝΩΣΤΟΠΟΙΗΣΗΣ.docx",
    "paragraph_index": 3,
    "start": 78,
    "end": 157,
    "replacement": "των διατάξεων του Ν. 4139/2013 ‘‘Περί εξαρτησιογόνων ουσιών’’"
  },
  {
    "path": "templates/dossiers/narcotics/04_ΕΚΘΕΣΗ_ΓΝΩΣΤΟΠΟΙΗΣΗΣ.docx",
    "paragraph_index": 3,
    "start": 770,
    "end": 899,
    "replacement": "σύμφωνα με το άρθρο 41 παρ. 2 του Ν. 4139/2013 ‘‘Περί εξαρτησιογόνων ουσιών’’"
  },
  {
    "path": "templates/dossiers/narcotics/08_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx",
    "paragraph_index": 32,
    "start": 106,
    "end": 125,
    "replacement": "Χημική Υπηρεσία Καλαμάτας"
  },
  {
    "path": "templates/noise/02_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx",
    "paragraph_index": 7,
    "start": 374,
    "end": 375,
    "replacement": "B"
  }
]

if MARKER.exists():
    print("Template privacy corrections already applied; skipping.")
    raise SystemExit(0)

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
TARGETS = sorted({item["path"] for item in OPERATIONS})
GROUPED = defaultdict(list)
for item in OPERATIONS:
    GROUPED[item["path"]].append(item)


def apply_span(paragraph, start, end, replacement):
    nodes = paragraph.xpath(".//w:t", namespaces=NS)
    values = [node.text or "" for node in nodes]
    whole = "".join(values)
    if start < 0 or end < start or end > len(whole):
        raise ValueError(f"Invalid text range in DOCX paragraph: {start}:{end}/{len(whole)}")
    if whole[start:end] == replacement:
        return
    offsets = []
    cursor = 0
    for value in values:
        offsets.append((cursor, cursor + len(value)))
        cursor += len(value)
    if start == end:
        index = next((i for i, (a, b) in enumerate(offsets) if a <= start <= b), len(nodes) - 1)
        a, _ = offsets[index]
        nodes[index].text = values[index][:start-a] + replacement + values[index][start-a:]
        return
    first = next(i for i, (a, b) in enumerate(offsets) if b > start)
    last = next(i for i, (a, b) in enumerate(offsets) if b >= end)
    a, _ = offsets[first]
    c, _ = offsets[last]
    if first == last:
        nodes[first].text = values[first][:start-a] + replacement + values[first][end-a:]
    else:
        nodes[first].text = values[first][:start-a] + replacement
        for index in range(first + 1, last):
            nodes[index].text = ""
        nodes[last].text = values[last][end-c:]


def patch_docx(relative_path):
    path = ROOT / relative_path
    source = path.read_bytes()
    zin = zipfile.ZipFile(io.BytesIO(source))
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            raw = zin.read(info.filename)
            if info.filename == "word/document.xml":
                document = etree.fromstring(raw)
                paragraphs = document.xpath(".//w:p", namespaces=NS)
                grouped = defaultdict(list)
                for operation in GROUPED[relative_path]:
                    grouped[operation["paragraph_index"]].append(operation)
                for paragraph_index, operations in grouped.items():
                    if paragraph_index >= len(paragraphs):
                        raise ValueError(f"Paragraph index missing in {relative_path}")
                    for operation in sorted(operations, key=lambda item: item["start"], reverse=True):
                        apply_span(paragraphs[paragraph_index], operation["start"], operation["end"], operation["replacement"])
                raw = etree.tostring(document, xml_declaration=True, encoding="UTF-8", standalone=True)
            zout.writestr(info, raw)
    result = output.getvalue()
    with zipfile.ZipFile(io.BytesIO(result)) as check:
        if "word/document.xml" not in check.namelist():
            raise ValueError(f"Invalid DOCX package: {relative_path}")
        etree.fromstring(check.read("word/document.xml"))
    path.write_bytes(result)
    return result


def update_embedded(module_path, export_name, sanitized_by_name):
    path = ROOT / module_path
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(r"(export const " + re.escape(export_name) + r"\s*=\s*)(\[[\s\S]*?\])(\s*;)")
    match = pattern.search(source)
    if not match:
        raise ValueError(f"Missing {export_name} in {module_path}")
    templates = json.loads(match.group(2))
    touched = 0
    for template in templates:
        filename = template.get("name")
        if filename in sanitized_by_name:
            data = sanitized_by_name[filename]
            template["dataBase64"] = base64.b64encode(data).decode("ascii")
            template["size"] = len(data)
            touched += 1
    if not touched:
        raise ValueError(f"No embedded templates updated in {module_path}:{export_name}")
    updated = match.group(1) + json.dumps(templates, ensure_ascii=False, separators=(",", ":")) + match.group(3)
    path.write_text(source[:match.start()] + updated + source[match.end():], encoding="utf-8")
    return touched


sanitized = {relative: patch_docx(relative) for relative in TARGETS}
by_filename = {Path(relative).name: data for relative, data in sanitized.items()}
update_embedded("camping-templates-data.js", "DEFAULT_CAMPING_TEMPLATES", by_filename)
update_embedded("noise-templates-data.js", "DEFAULT_NOISE_TEMPLATES", by_filename)
update_embedded("dossier-templates-data.js", "DEFAULT_NARCOTICS_TEMPLATES", by_filename)

def patch_embedded_counterfeit_templates():
    """Fix the B-investigator service and bind the ATM banknote serial number."""
    path = ROOT / "dossier-templates-data.js"
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(r"(export const DEFAULT_COUNTERFEIT_TEMPLATES\\s*=\\s*)(\\[[\\s\\S]*?\\])(\\s*;)")
    match = pattern.search(source)
    if not match:
        raise ValueError("Missing DEFAULT_COUNTERFEIT_TEMPLATES")
    templates = json.loads(match.group(2))
    touched = 0
    for template in templates:
        if template.get("id") not in ("counterfeit-01", "counterfeit-02"):
            continue
        package = base64.b64decode(template["dataBase64"])
        zin = zipfile.ZipFile(io.BytesIO(package))
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                raw = zin.read(info.filename)
                if info.filename == "word/document.xml":
                    document = etree.fromstring(raw)
                    paragraphs = document.xpath(".//w:p", namespaces=NS)
                    target = None
                    for paragraph in paragraphs:
                        text = "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))
                        if "{{officerB.fullName}}" in text and "{{officerA.service}}" in text:
                            target = paragraph
                            break
                    if target is None:
                        raise ValueError(f"Missing B-investigator paragraph in {template['id']}")
                    text = "".join(target.xpath(".//w:t/text()", namespaces=NS))
                    b_name = text.index("{{officerB.fullName}}")
                    service_start = text.find("{{officerA.service}}", b_name)
                    if service_start < 0:
                        raise ValueError(f"Missing B-investigator service mapping in {template['id']}")
                    apply_span(target, service_start, service_start + len("{{officerA.service}}"), "{{officerB.service}}")
                    if template["id"] == "counterfeit-01":
                        serial_done = False
                        for paragraph in paragraphs:
                            paragraph_text = "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))
                            match_serial = re.search(r"υπ[’']\\s*αριθ\\.\\s*(\\.{5,})", paragraph_text, re.IGNORECASE)
                            if match_serial:
                                start = match_serial.start(1)
                                end = match_serial.end(1)
                                apply_span(paragraph, start, end, "{{counterfeit.serialNumber}}")
                                serial_done = True
                                break
                        if not serial_done:
                            raise ValueError("Missing serial-number blank in counterfeit-01")
                    raw = etree.tostring(document, xml_declaration=True, encoding="UTF-8", standalone=True)
                zout.writestr(info, raw)
        data = output.getvalue()
        with zipfile.ZipFile(io.BytesIO(data)) as check:
            etree.fromstring(check.read("word/document.xml"))
        template["dataBase64"] = base64.b64encode(data).decode("ascii")
        template["size"] = len(data)
        if "officerB.service" not in template["fields"]:
            template["fields"].append("officerB.service")
        template.setdefault("mappings", {})["officerB.service"] = "officerB.service"
        touched += 1
    if touched != 2:
        raise ValueError("Expected to update counterfeit-01 and counterfeit-02")
    updated = match.group(1) + json.dumps(templates, ensure_ascii=False, separators=(",", ":")) + match.group(3)
    path.write_text(source[:match.start()] + updated + source[match.end():], encoding="utf-8")
    print("Updated B-investigator service and counterfeit serial-number mapping in embedded templates.")

patch_embedded_counterfeit_templates()

# Verify every changed embedded DOCX is byte-for-byte identical to its source file.
for module_path, export_name in [
    ("camping-templates-data.js", "DEFAULT_CAMPING_TEMPLATES"),
    ("noise-templates-data.js", "DEFAULT_NOISE_TEMPLATES"),
    ("dossier-templates-data.js", "DEFAULT_NARCOTICS_TEMPLATES"),
]:
    source = (ROOT / module_path).read_text(encoding="utf-8")
    match = re.search(r"export const " + re.escape(export_name) + r"\s*=\s*(\[[\s\S]*?\])\s*;", source)
    if not match:
        raise ValueError(f"Could not verify {export_name}")
    for template in json.loads(match.group(1)):
        filename = template.get("name")
        if filename in by_filename:
            if base64.b64decode(template["dataBase64"]) != by_filename[filename]:
                raise ValueError(f"Embedded DOCX mismatch: {filename}")

MARKER.write_text("v1\n", encoding="utf-8")
print(f"Sanitized {len(TARGETS)} DOCX templates and synchronized embedded copies.")
