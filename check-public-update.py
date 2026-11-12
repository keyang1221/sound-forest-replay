#!/usr/bin/env python3
"""Skip data-only publication unless the actual interaction payload changed."""
import argparse, json, pathlib, re, time, urllib.error, urllib.request

def read_published(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'Cache-Control':'no-cache'})
            with urllib.request.urlopen(request, timeout=20) as response:
                published = json.load(response)
            if published.get('version') != 1: raise ValueError('Invalid published manifest')
            return published
        except urllib.error.HTTPError as error:
            if error.code == 404: return {}
            if error.code not in (408, 429, 500, 502, 503, 504) or attempt == 2: raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2: raise
        time.sleep(2 ** (attempt + 1))

def check(args):
    candidate = pathlib.Path(args.candidate)
    changed = False
    if candidate.is_file():
        data = json.loads(candidate.read_text())
        revision = data.get('dataRevision', '')
        if data.get('version') != 1 or not re.fullmatch(r'[a-f0-9]{64}', revision):
            raise ValueError('Invalid candidate data revision')
        if args.event == 'push':
            changed = True  # Code changes still publish even when data is unchanged.
        else:
            published = read_published(args.published_url)
            changed = revision != published.get('dataRevision')
    with open(args.github_output, 'a') as output:
        output.write(f'changed={str(changed).lower()}\n')
    print('Interaction data changed; publishing.' if changed else 'No interaction data update; publication skipped.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--published-url', required=True)
    parser.add_argument('--event', required=True)
    parser.add_argument('--github-output', required=True)
    check(parser.parse_args())
