#!/usr/bin/env python3
"""Deterministic manifest-root XPI ZIP; never includes source credentials."""
import os
import pathlib
import sys
import zipfile


def pack(source, output):
    source = pathlib.Path(source).resolve()
    output = pathlib.Path(output).resolve()
    if not (source / 'manifest.json').is_file():
        raise SystemExit('manifest.json missing at XPI root')
    output.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in source.rglob('*') if p.is_file())
    if any(p.is_symlink() for p in source.rglob('*')):
        raise SystemExit('XPI contents cannot include symlinks')
    with zipfile.ZipFile(output, 'w') as zip_file:
        for file in files:
            rel = file.relative_to(source).as_posix()
            if '..' in pathlib.PurePosixPath(rel).parts:
                raise SystemExit('Unsafe XPI name')
            info = zipfile.ZipInfo(rel, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100644 << 16)
            info.compress_type = zipfile.ZIP_DEFLATED
            zip_file.writestr(info, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(output) as zip_file:
        if zip_file.namelist() != sorted(zip_file.namelist()):
            raise SystemExit('Unstable member ordering')
        for name in zip_file.namelist():
            if zip_file.getinfo(name).date_time[:3] != (1980, 1, 1):
                raise SystemExit('Non-reproducible timestamp')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: zip-xpi.py XPI_ROOT OUTPUT.xpi')
    pack(*sys.argv[1:])
