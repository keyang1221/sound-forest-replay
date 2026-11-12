#!/usr/bin/env python3
"""Build a static site containing only the interaction fields needed by the UI."""
import argparse, csv, datetime, hashlib, json, math, os, pathlib, re, shutil
FIELDS = ['local_time', 'elapsed_s', 'string_id', 'amplitude_linear', 'slope_raw', 'pitch_level']
NAME = re.compile(r'^soundforest_onsets_(\d{6})\.csv$')

def build(args):
    assets, output = pathlib.Path(args.assets).resolve(), pathlib.Path(args.output).resolve()
    if assets == output: raise ValueError('Output must be separate from source assets')
    days = {}
    for folder in args.data_dir:
        for directory, children, names in os.walk(folder, followlinks=False):
            children[:] = [n for n in children if n not in ('.git', 'node_modules', '_site') and not pathlib.Path(directory, n).is_symlink()]
            for name in sorted(names):
                match = NAME.fullmatch(name)
                path = pathlib.Path(directory, name)
                if not match or path.is_symlink() or not path.is_file(): continue
                code = match[1]
                date = datetime.date(2000+int(code[:2]), int(code[2:4]), int(code[4:6])).isoformat()
                if not date.startswith('20'): raise ValueError('Expected a 20YY file date')
                events = []
                with path.open(newline='', encoding='utf-8-sig') as source:
                    rows = csv.reader(source)
                    if next(rows, None) != FIELDS: raise ValueError(f'Invalid CSV header: {name}')
                    for row in rows:
                        if not row or not any(row): continue
                        try:
                            if len(row) != 6: raise ValueError()
                            stamp = datetime.datetime.strptime('20'+row[0].strip(), '%Y%m%d_%H%M%S')
                            values = [float(v) for v in row[1:]]
                            if stamp.date().isoformat() != date or not all(math.isfinite(v) for v in values): raise ValueError()
                            elapsed, string_id, amplitude, slope, pitch = values
                            if elapsed < 0 or not string_id.is_integer() or not 1 <= string_id <= 5 or not 0 <= amplitude <= 1: raise ValueError()
                            events.append([stamp.hour*3600+stamp.minute*60+stamp.second, int(string_id), amplitude])
                        except (ValueError, OverflowError):
                            raise ValueError(f'Invalid interaction row in {name}') from None
                events.sort(key=lambda e: e[0])
                if date in days and days[date] != events: raise ValueError(f'Conflicting source files for {date}')
                days[date] = events
    if not args.data_dir:
        snapshot = pathlib.Path(args.snapshot)
        manifest = json.loads((snapshot / 'data-manifest.json').read_text())
        if manifest.get('version') != 1: raise ValueError('Invalid public snapshot')
        if not args.revision: args.revision = manifest.get('sourceRevision', '')
        for entry in manifest['days']:
            date = datetime.date.fromisoformat(entry['date']).isoformat()
            if entry['url'] != f'./day-{date}.json': raise ValueError('Invalid snapshot path')
            payload = json.loads((snapshot / f'day-{date}.json').read_text())
            if payload.get('version') != 1 or payload.get('date') != date: raise ValueError('Invalid snapshot day')
            for event in payload['events']:
                if len(event) != 3 or type(event[0]) is not int or not 0 <= event[0] < 86400 or type(event[1]) is not int or not 1 <= event[1] <= 5 or not isinstance(event[2], (int,float)) or not math.isfinite(event[2]) or not 0 <= event[2] <= 1:
                    raise ValueError('Invalid snapshot trigger')
            days[date] = payload['events']
    if not days: raise ValueError('No valid daily data found; refusing to publish an empty dataset')
    output.mkdir(parents=True, exist_ok=True)
    for old in output.glob('day-????-??-??.json'): old.unlink()
    for asset in assets.iterdir():
        if asset.is_file() and not asset.is_symlink() and asset.suffix in ('.html', '.css', '.mjs', '.js', '.svg'):
            shutil.copyfile(asset, output / asset.name)
    digest = hashlib.sha256()
    entries = []
    for date, events in sorted(days.items()):
        text = json.dumps({'version':1,'date':date,'events':events}, separators=(',', ':'), allow_nan=False)+'\n'
        (output / f'day-{date}.json').write_text(text)
        digest.update(text.encode())
        entries.append({'date':date,'url':f'./day-{date}.json','count':len(events)})
    manifest = {'version':1,'sourceRevision':args.revision or digest.hexdigest(),'days':entries}
    (output / 'data-manifest.json').write_text(json.dumps(manifest, separators=(',', ':'))+'\n')
    (output / '.nojekyll').write_text('')
    print(f'Published bundle: {len(entries)} dates, {sum(e["count"] for e in entries)} triggers. Raw CSVs are excluded.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', action='append', default=[])
    parser.add_argument('--snapshot', default='.')
    parser.add_argument('--assets', default='dist')
    parser.add_argument('--output', required=True)
    parser.add_argument('--revision', default='')
    build(parser.parse_args())
