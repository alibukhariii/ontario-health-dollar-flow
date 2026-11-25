#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import shutil
from decimal import Decimal, ROUND_CEILING
from pathlib import Path

import build_data


STATIC_FILES = (
    "index.html",
    "styles.css",
    "browser-app.mjs",
    "app-model.mjs",
    "renderers.mjs",
    "network.mjs",
)


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _format_cad(value: str) -> str:
    amount = Decimal(value)
    absolute = abs(amount)
    if absolute >= Decimal("1000000000"):
        return f"${amount / Decimal('1000000000'):.1f}B"
    if absolute >= Decimal("1000000"):
        return f"${amount / Decimal('1000000'):.1f}M"
    if absolute >= Decimal("1000"):
        return f"${amount / Decimal('1000'):.1f}K"
    return f"${amount:,.0f}"


def _route_rows(payload: dict[str, object]) -> str:
    return "".join(
        "<tr>"
        f"<td>{html.escape(str(route['ministry']))}</td>"
        f"<td>{html.escape(str(route['category_label']))}</td>"
        f"<td>{html.escape(str(route['program_label']))}</td>"
        f"<td>{_format_cad(str(route['amount_cad']))}</td>"
        "</tr>"
        for route in payload.get("incoming_routes", [])
    )


def _static_recipient(recipient: dict[str, object], payload: dict[str, object], source: dict[str, str]) -> str:
    routes = list(payload.get("incoming_routes", []))
    return f"""<article class="static-recipient">
      <a class="static-recipient__back" href="./">Explore all recipients</a>
      <header>
        <p>Published recipient #{html.escape(str(recipient['global_rank']))} · {html.escape(str(recipient['payee_type']))}</p>
        <h2>{html.escape(str(recipient['label']))}</h2>
        <strong>{_format_cad(str(recipient['amount_cad']))}</strong>
        <span>Total positive payments published for this recipient in FY 2025–26</span>
      </header>
      <h3>{len(routes)} published program route{'s' if len(routes) != 1 else ''}</h3>
      <div class="static-table-scroll"><table>
        <thead><tr><th>Ministry</th><th>Funding purpose</th><th>Official program</th><th>Amount</th></tr></thead>
        <tbody>{_route_rows(payload)}</tbody>
      </table></div>
      <p class="static-recipient__source">Source: <a href="{html.escape(source['url'])}">{html.escape(source['label'])}</a></p>
    </article>"""


def _static_overview(network: dict[str, object]) -> str:
    category_rows = "".join(
        f"<tr><td>{html.escape(str(row['label']))}</td><td>{_format_cad(str(row['amount_cad']))}</td><td>{html.escape(str(row['share_percent']))}%</td></tr>"
        for row in network["categories"]
    )
    top_recipients = "".join(
        f"<li><a href=\"recipient/{html.escape(str(row['recipient_id']))}/\"><span>{html.escape(str(row['label']))}</span><strong>{_format_cad(str(row['amount_cad']))}</strong></a></li>"
        for row in network["recipients"][:25]
    )
    return f"""<article class="static-overview">
      <p>This page remains readable without JavaScript. The interactive network adds every program and recipient connection.</p>
      <h3>Fourteen funding purposes</h3>
      <div class="static-table-scroll"><table><thead><tr><th>Funding purpose</th><th>Amount</th><th>Share</th></tr></thead><tbody>{category_rows}</tbody></table></div>
      <h3>Largest named recipients</h3>
      <ol>{top_recipients}</ol>
      <p><a href="recipients/">Browse all {int(network['named_recipient_count']):,} named recipients</a></p>
    </article>"""


def _overview_recipient_chart(network: dict[str, object]) -> str:
    recipients = [
        row for row in network["recipients"]
        if str(row["label"]).strip().casefold() != "ontario health"
    ][:10]
    maximum_billions = max(
        (Decimal(str(row["amount_cad"])) / Decimal("1000000000") for row in recipients),
        default=Decimal("1"),
    )
    tick_steps = (
        Decimal("0.1"), Decimal("0.2"), Decimal("0.25"), Decimal("0.5"),
        Decimal("1"), Decimal("2"), Decimal("5"),
    )
    tick_step = next(
        step for step in tick_steps
        if (maximum_billions / step).to_integral_value(rounding=ROUND_CEILING) <= 5
    )
    axis_max_billions = (
        (maximum_billions / tick_step).to_integral_value(rounding=ROUND_CEILING)
        * tick_step
    )
    tick_count = int(axis_max_billions / tick_step)
    ticks = [tick_step * index for index in range(tick_count + 1)]
    tick_labels = "".join(
        f"<span>{tick.quantize(Decimal('1')) if tick == tick.to_integral_value() else tick.normalize()}</span>"
        for tick in ticks
    )
    maximum = axis_max_billions * Decimal("1000000000")
    palette = (
        "#f4b7a5", "#a9d8cf", "#b8c8f0", "#f2d18d", "#cbb9df",
        "#b9d8aa", "#efb9cf", "#b9d8ec", "#d9c6a5", "#c4d8c9",
    )
    bars = []
    for index, recipient in enumerate(recipients):
        amount = Decimal(str(recipient["amount_cad"]))
        width = amount / maximum * Decimal("100")
        recipient_id = html.escape(str(recipient["recipient_id"]))
        label = html.escape(str(recipient["label"]))
        bars.append(
            '<li class="overview-chart__row">'
            f'<a href="recipient/{recipient_id}/" data-overview-recipient="{recipient_id}" '
            f'style="--bar-share:{width:.4f}%;--bar-colour:{palette[index]};--bar-delay:{index * 55}ms">'
            f'<span class="overview-chart__name">{label}</span>'
            '<span class="overview-chart__track" aria-hidden="true">'
            '<i class="overview-chart__bar"></i></span>'
            f'<strong>{_format_cad(str(recipient["amount_cad"]))}</strong>'
            '</a></li>'
        )
    return f"""<section class="overview-recipient-chart" id="overview-recipient-chart" aria-labelledby="overview-chart-title">
      <h2 class="overview-chart__title" id="overview-chart-title">The top {len(recipients)} recipients were</h2>
      <ol class="overview-chart__plot">{''.join(bars)}</ol>
      <div class="overview-chart__axis">
        <span></span><div class="overview-chart__ticks" aria-hidden="true">{tick_labels}</div><span></span>
        <strong class="overview-chart__axis-title">Amount (billions)</strong>
      </div>
    </section>"""


def _replace_overview_chart(document: str, network: dict[str, object]) -> str:
    marker = """<section class="overview-recipient-chart" id="overview-recipient-chart" aria-label="Largest named recipients">
            <p class="loading">Loading the largest named recipients…</p>
          </section>"""
    if marker not in document:
        raise ValueError("The overview recipient-chart marker is missing from index.html")
    return document.replace(marker, _overview_recipient_chart(network), 1)


def _replace_canvas(document: str, content: str) -> str:
    marker = '<div class="network-canvas" id="network-canvas"><p class="loading">Loading the published payment network…</p></div>'
    replacement = f'<div class="network-canvas" id="network-canvas">{content}</div>'
    if marker not in document:
        raise ValueError("The network canvas marker is missing from index.html")
    return document.replace(marker, replacement, 1)


def generate_static_pages(output_root: Path, release: dict[str, object]) -> None:
    release_root = output_root / "data" / "releases" / str(release["release_id"])
    network = _read_json(release_root / "network-overview.json")
    source_template = (output_root / "index.html").read_text(encoding="utf-8")
    source_template = _replace_overview_chart(source_template, network)
    root_document = _replace_canvas(source_template, _static_overview(network))
    (output_root / "index.html").write_text(root_document, encoding="utf-8")

    recipient_links = []
    for recipient in network["recipients"]:
        recipient_id = str(recipient["recipient_id"])
        if not recipient_id.replace("_", "").replace("-", "").isalnum():
            raise ValueError(f"Unsafe recipient identifier: {recipient_id}")
        payload = _read_json(release_root / str(recipient["path"]))
        recipient_document = source_template.replace(
            "<head>",
            '<head>\n    <base href="../../">',
            1,
        ).replace(
            "<body>",
            f'<body data-recipient-id="{html.escape(recipient_id)}">',
            1,
        ).replace(
            "<title>Where Ontario’s Health Dollars Went</title>",
            f"<title>{html.escape(str(recipient['label']))} | Where Ontario’s Health Dollars Went</title>",
            1,
        ).replace(
            '<meta name="description" content="Follow Ontario’s published health-ministry payments from the ministry to the recipient.">',
            f'<meta name="description" content="{html.escape(str(recipient["label"]))} received {_format_cad(str(recipient["amount_cad"]))} in positive published Ontario health-ministry payments in FY 2025–26.">',
            1,
        )
        recipient_document = _replace_canvas(
            recipient_document,
            _static_recipient(recipient, payload, network["source"]),
        )
        target = output_root / "recipient" / recipient_id / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(recipient_document, encoding="utf-8")
        recipient_links.append(
            f'<li><a href="recipient/{html.escape(recipient_id)}/"><span>{html.escape(str(recipient["label"]))}</span><strong>{_format_cad(str(recipient["amount_cad"]))}</strong></a></li>'
        )

    recipients_document = f"""<!doctype html><html lang="en-CA"><head><base href="../"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="All named recipients in Ontario's 2025–26 published health-ministry payment records."><title>All named recipients | Where Ontario’s Health Dollars Went</title><link rel="stylesheet" href="styles.css"></head><body class="recipient-index"><main><a href="./">Where Ontario’s Health Dollars Went</a><h1>All {int(network['named_recipient_count']):,} named recipients</h1><p>Ranked by positive published payments in FY 2025–26.</p><ol>{''.join(recipient_links)}</ol></main></body></html>"""
    recipient_index = output_root / "recipients" / "index.html"
    recipient_index.parent.mkdir(parents=True, exist_ok=True)
    recipient_index.write_text(recipients_document, encoding="utf-8")


def build_site(site_root: Path, workspace_root: Path, output_root: Path):
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True)
    source_root = site_root / "src"
    for filename in STATIC_FILES:
        shutil.copy2(source_root / filename, output_root / filename)
    release = build_data.build_release(workspace_root, output_root)
    generate_static_pages(output_root, release)
    return release


def main() -> None:
    site_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, default=site_root.parents[1])
    parser.add_argument("--output", type=Path, default=site_root / "dist")
    args = parser.parse_args()
    release = build_site(site_root, args.workspace_root.resolve(), args.output.resolve())
    print(
        f"Built {release['release_id']} ({release['fiscal_year']}) at "
        f"{args.output.resolve()}"
    )


if __name__ == "__main__":
    main()
