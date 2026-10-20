"""Copy transitive non-system dylibs beside native tools; remove Homebrew paths."""
import pathlib, shutil, subprocess
root = pathlib.Path('.cache/toolchain/openxc7').resolve()
lib = root / 'lib'
lib.mkdir(exist_ok=True)
pending = [(p, p) for p in (root / 'bin').iterdir() if p.is_file()]
seen = set()
while pending:
    source, target = pending.pop()
    if target in seen: continue
    seen.add(target)
    lines = subprocess.check_output(['otool', '-L', str(source)],text=True).splitlines()[1:]
    for line in lines:
        dep = line.strip().split(' (')[0]
        if dep.startswith(('/usr/lib/', '/System/Library/')): continue
        if dep.startswith('@loader_path/'):
            original = source.parent / dep[len('@loader_path/'):]
        elif dep.startswith('/'): original = pathlib.Path(dep)
        else: raise RuntimeError('Unresolved dependency: '+dep)
        if original.resolve() == source.resolve(): continue
        copied = lib / original.name
        if not copied.exists(): shutil.copy2(original, copied)
        replacement = '@loader_path/' + ('../lib/' if target.parent.name == 'bin' else '') + copied.name
        subprocess.run(['install_name_tool', '-change', dep, replacement, str(target)],check=True)
        pending.append((original, copied))
    if target.suffix == '.dylib':
        subprocess.run(['install_name_tool','-id','@loader_path/'+target.name,str(target)],check=True)
for target in seen:
    subprocess.run(['codesign','--force','--sign','-',str(target)],check=True)
print('Relocated and ad-hoc signed', len(seen), 'native binaries/libraries')
