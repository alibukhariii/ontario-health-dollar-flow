#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
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


def build_site(site_root: Path, workspace_root: Path, output_root: Path):
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True)
    source_root = site_root / "src"
    for filename in STATIC_FILES:
        shutil.copy2(source_root / filename, output_root / filename)
    return build_data.build_release(workspace_root, output_root)


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
