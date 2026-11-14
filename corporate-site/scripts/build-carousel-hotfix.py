#!/usr/bin/env python3
"""Build a guarded three-file static overlay; never writes the installed release."""
import argparse
import hashlib
import json
from pathlib import Path
import re

BASELINE = {
    'pl': '34d6dab5b35d0b0ad556903ce5670c6c3ba0c30543d37e28498c6fb5be589000',
    'lt': 'ef398d521524cde1425997b72db23b07c75a81c8c672aae149e182afc9a4c2af',
}
SOURCE_SHA = '799e8b8a2fb3b05d933479fe6afc1b128a4b5d8e'
BASE_ARTIFACT = 'a503dbb8379a8a7aff083fe3891ba352379643f0e9c8a12156dd1608cd771f4e'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def only(pattern, value):
    matches = list(re.finditer(pattern, value))
    if len(matches) != 1:
        raise ValueError(f'Expected one match, found {len(matches)}: {pattern}')
    return matches[0]


def patch_page(baseline, built, locale):
    if digest(baseline) != BASELINE[locale]:
        raise ValueError(f'{locale}: production baseline changed')
    old, new = baseline.decode(), built.decode()
    hero = r'<section\b[^>]*class="[^"]*\bregional-hero\b[^\"]*"[^>]*>[\s\S]*?</section>'
    before, after = only(hero, old), only(hero, new)
    assert '<knaba-service-carousel' not in old
    assert after[0].count('<knaba-service-carousel') == 1
    assert after[0].count('data-carousel-slide ') == 8
    old_style = only(r'<style[^>]*>([\s\S]*?)</style>', old)
    new_style = only(r'<style[^>]*>([\s\S]*?)</style>', new)
    # The only CSS addition is the responsive hero layout; keep all old CSS bytes.
    assert new_style[1].endswith(old_style[1])
    addition = new_style[1][:-len(old_style[1])]
    assert 'regional-home-hero' in addition and '880px' in addition
    stylesheet = only(r'<link rel="stylesheet" href="(/_astro/ServiceCarousel\.[A-Za-z0-9_-]+\.css)">', new)
    # Replacing the hero is the only body change. Other components, scripts,
    # account links, content, SEO and all runtime/backend artifacts are retained.
    result = old[:before.start()] + after[0] + old[before.end():]
    head_addition = stylesheet[0] + '<style>' + addition + '</style>'
    assert result.count('</head>') == 1
    result = result.replace('</head>', head_addition + '</head>', 1)
    recovered = result.replace(head_addition, '', 1).replace(after[0], before[0], 1)
    assert recovered == old, 'Unrelated markup changed'
    assert result.count('<knaba-service-carousel') == 1
    return result.encode(), stylesheet[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-dir', type=Path, required=True)
    parser.add_argument('--built-client', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Output already exists; choose a new candidate directory')
    files, overrides = {}, {}
    for lang in BASELINE:
        original = (args.baseline_dir / f'baseline-{lang}.html').read_bytes()
        updated, css_path = patch_page(original, (args.built_client / lang / 'index.html').read_bytes(), lang)
        files[f'dist/client/{lang}/index.html'] = updated
        overrides[f'/{lang}/'] = {'body': updated.decode(), 'contentType': 'text/html; charset=utf-8'}
        css = (args.built_client / css_path.lstrip('/')).read_bytes()
        files['dist/client' + css_path] = css
        overrides[css_path] = {'body': css.decode(), 'contentType': 'text/css; charset=utf-8'}
    assert len(files) == 3
    args.output.mkdir(parents=True)
    manifest = {}
    for name, data in files.items():
        target = args.output / 'overlay' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        manifest[name] = {'sha256': digest(data), 'bytes': len(data)}
    report = {'source_sha': SOURCE_SHA, 'expected_current_artifact': BASE_ARTIFACT,
              'baseline_pages': BASELINE, 'files': manifest,
              'scope': 'Two homepage hero blocks, one shared stylesheet; runtime and other page bytes preserved'}
    (args.output / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    (args.output / 'browser-overrides.json').write_text(json.dumps(overrides, ensure_ascii=False))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
