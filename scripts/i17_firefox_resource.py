"""I17 packaged Firefox procfs measurement. No process environment or cmdlines."""
import os
import pathlib
import re

def sample_firefox_processes(binary, proc_root="/proc"):
    root=pathlib.Path(proc_root)
    if not root.is_dir():return {'available':False,'reason':'PROCFS_UNAVAILABLE'}
    intended=pathlib.Path(binary).resolve().parent
    count=0;rss=0;cpu=0;threads=0
    for entry in root.iterdir():
        if not entry.name.isdecimal():continue
        try:
            target=pathlib.Path(os.readlink(entry/'exe')).resolve()
            if target.parent!=intended or target.name not in {'firefox','firefox-bin'}:
                continue
            status=(entry/'status').read_text()
            mem=re.search(r'^VmRSS:\s*(\d+)\s*kB$',status,re.MULTILINE)
            t=re.search(r'^Threads:\s*(\d+)$',status,re.MULTILINE)
            raw=(entry/'stat').read_text()
            end=raw.rfind(')')
            if end<0:continue
            fields=raw[end+2:].split()
            if len(fields)<13:continue
            count+=1
            rss+=int(mem.group(1)) if mem else 0
            threads+=int(t.group(1)) if t else 0
            cpu+=int(fields[11])+int(fields[12])
        except (OSError,ValueError):
            continue
    if not count:return {'available':False,'reason':'FIREFOX_PROCESS_NOT_OBSERVED'}
    return {'available':True,'processes':count,'rssSumKiB':rss,
            'cpuTicks':cpu,'threads':threads,
            'scope':'MATCHED_FIREFOX_EXECUTABLE_FAMILY',
            'qualification':'PROCESS_SUM_SNAPSHOT_NOT_PEAK'}
