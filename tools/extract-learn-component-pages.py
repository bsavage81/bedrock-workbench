# Select verified Learn Markdown sources from an archive without extracting the archive.
import argparse, hashlib, json, pathlib, zipfile
parser=argparse.ArgumentParser()
parser.add_argument('archive'); parser.add_argument('tree'); parser.add_argument('output')
args=parser.parse_args(); root=pathlib.Path(__file__).resolve().parent.parent
links=json.loads((root/'src/documentation-links.json').read_text(encoding='utf-8'))
tree=json.loads(pathlib.Path(args.tree).read_text(encoding='utf-8'))
entries={entry['path'].lower():entry for entry in tree['tree'] if entry.get('type')=='blob'}
result={'source':'https://github.com/MicrosoftDocs/minecraft-creator','revision':tree['sha'],'license':'CC-BY-4.0','pages':{}}
with zipfile.ZipFile(args.archive) as archive:
    names={name.lower().split('/creator/',1)[1]:name for name in archive.namelist() if '/creator/' in name.lower()}
    for kind,components in links['components'].items():
        for component,relative in components.items():
            key=relative.lower()+'.md'; name=names.get(key); entry=entries.get('creator/'+key)
            if not name or not entry: raise ValueError('Missing Learn source: '+key)
            data=archive.read(name)
            actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
            if actual!=entry['sha']: raise ValueError('Learn source differs from Git tree: '+key)
            result['pages'][kind+'|'+component]={'path':entry['path'],'sha':actual,'text':data.decode('utf-8-sig')}
pathlib.Path(args.output).write_text(json.dumps(result),encoding='utf-8')
print(json.dumps({'verifiedPages':len(result['pages']),'revision':result['revision']}))
