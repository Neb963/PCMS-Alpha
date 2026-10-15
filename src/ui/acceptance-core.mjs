// I17 operator observations are local, self-attested records, never
// PCMS Core/Persona/remote-provider authority or executed H-test proof.
export const CASES=Object.freeze([
  ['P56-01','Source release, edited source and relevant Git drift'],
  ['P56-02','Protected-route outage and account-isolated rebind'],
  ['P56-03','Fleet capacity shock, offline and cold wake'],
  ['P56-04','Authenticated backup and inactive dual-profile restore'],
  ['P56-05','Two-view stale revisions and sender boundary'],
  ['P56-06','Mixed batch receipts and uncertain create/rename'],
  ['P56-07','AI evidence bound to final complete source'],
  ['P56-08','Core failure and independent safe diagnostics'],
  ['P56-09','Packaged Firefox keyboard, AT, reflow and RTL'],
  ['P56-10','Fleet incident grouping and checklist fallback'],
  ['H-01','Required: human keyboard, screen-reader and reflow audit'],
  ['H-02','Conditional: one owned-account identity read-only proof'],
  ['H-03','Conditional: authorized native AI and source proof'],
  ['H-04','Conditional: authorized single-target refresh efficacy'],
  ['H-05','Conditional: KDE vault and independent backup readback'],
  ['H-06','Migration only: separate old-controller shutdown and activation'],
  ['H-07','Required: human checklist evidence and Markdown fallback']
].map(([id,label])=>Object.freeze({id,label})));
export const STATES=Object.freeze(['NOT_TESTED','BLOCKED','PASS','FAIL','NOT_APPLICABLE']);
export const TIERS=Object.freeze(['NOT_EXECUTED','DETERMINISTIC_F_X','PACKAGED_FIREFOX_B','OPERATOR_FIREFOX_H','OPERATOR_LIVE_H']);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const cleanRef=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/.test(s);
const cleanNote=s=>typeof s==='string'&&s.length>=12&&s.length<=240&&
  /^[A-Za-z0-9 ,._()'-]+$/.test(s)&&!s.includes('  ');
export function emptyChecklist(){
  return {schema:'PCMS_I17_LOCAL_CHECKLIST_V1',revision:1,entries:Object.fromEntries(
    CASES.map(c=>[c.id,{state:'NOT_TESTED',tier:'NOT_EXECUTED',reference:'',note:''}]))};
}
export function validateEntry(id,entry){
  if(!CASES.some(c=>c.id===id)||!entry||typeof entry!=='object'||Array.isArray(entry)||
    Object.keys(entry).some(k=>!['state','tier','reference','note'].includes(k))||
    !STATES.includes(entry.state)||!TIERS.includes(entry.tier))return false;
  const actionable=entry.state!=='NOT_TESTED';
  if(entry.state==='NOT_TESTED')
    return entry.tier==='NOT_EXECUTED'&&entry.reference===''&&entry.note==='';
  if(!cleanRef(entry.reference)||!cleanNote(entry.note))return false;
  if(['PASS','FAIL'].includes(entry.state)&&entry.tier==='NOT_EXECUTED')return false;
  if(entry.state==='PASS'&&id.startsWith('H-')&&!entry.tier.startsWith('OPERATOR_'))return false;
  if(entry.state==='PASS'&&id.startsWith('P56-')&&entry.tier==='OPERATOR_LIVE_H')
    return false; // no automatic elevation of synthetic cross-system proofs
  return actionable;
}
export function normalizeChecklist(value){
  if(!value||value.schema!=='PCMS_I17_LOCAL_CHECKLIST_V1'||
    !Number.isSafeInteger(value.revision)||value.revision<1||!value.entries||
    typeof value.entries!=='object'||Array.isArray(value.entries)||
    Object.keys(value.entries).length!==CASES.length)return emptyChecklist();
  for(const c of CASES)if(!own(value.entries,c.id)||!validateEntry(c.id,value.entries[c.id]))
    return emptyChecklist();
  return {schema:'PCMS_I17_LOCAL_CHECKLIST_V1',revision:value.revision,
    entries:Object.fromEntries(CASES.map(c=>[c.id,{...value.entries[c.id]}]))};
}
export function recordObservation(data,id,entry,expectedRevision){
  const old=normalizeChecklist(data);
  if(!Number.isSafeInteger(expectedRevision)||old.revision!==expectedRevision)
    return {ok:false,code:'STALE_CHECKLIST'};
  if(!validateEntry(id,entry))return {ok:false,code:'EVIDENCE_REQUIRED_OR_INVALID'};
  return {ok:true,value:{...old,revision:old.revision+1,
    entries:{...old.entries,[id]:{...entry}}}};
}
const escapeTable=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
export function checklistMarkdown(data,{buildSha='',firefox='',fixture=''}={},safeReport=null){
  const d=normalizeChecklist(data);
  if(buildSha!==''&&!/^[a-f0-9]{64}$/.test(buildSha))throw Error('INVALID_BUILD_SHA');
  if(firefox!==''&&!/^[a-zA-Z0-9 ._()-]{1,80}$/.test(firefox))throw Error('INVALID_BROWSER_LABEL');
  if(fixture!==''&&!cleanRef(fixture))throw Error('INVALID_FIXTURE_ID');
  if(safeReport!==null&&safeReport?.schema!=='PCMS_SAFE_DIAGNOSTIC_V1')
    throw Error('UNVERIFIED_DIAGNOSTIC');
  const output=[
    '# PCMS Alpha — operator acceptance (self-reported; not independently verified)',
    '',
    'No check is an automatic PASS. This checklist never grants capability activation,',
    'publication, migration authority or CI/Stage 7 sign-off.',
    '',
    '- Checklist revision: '+d.revision,
    '- Combined XPI SHA-256: '+(buildSha||'NOT_RECORDED'),
    '- Firefox build: '+(firefox||'NOT_RECORDED'),
    '- Sanitized fixture: '+(fixture||'NOT_RECORDED'),
    '',
    '| Test | Result | Claimed evidence tier | Opaque reference | Observed fact / blocker |',
    '| --- | --- | --- | --- | --- |'
  ];
  for(const c of CASES){
    const e=d.entries[c.id];
    output.push('| '+c.id+' — '+escapeTable(c.label)+' | '+e.state+' | '+e.tier+
      ' | '+(e.reference||'—')+' | '+(e.note||'—')+' |');
  }
  output.push('', '## Safe independent diagnostics', '');
  // Only documented safe-report allowlisted primitives, never arbitrary inputs.
  if(safeReport){
    const sr=safeReport,allowed=['section_unavailable','allowlisted','RESTORE_IN_PROGRESS','RESTORE_MARKER_INVALID'];
    const section=k=>allowed.includes(sr.sections?.[k])?sr.sections[k]:'section_unavailable';
    output.push('- Wake section: '+section('wake'),
      '- Canonical section: '+section('canonical'),
      '- Donor section: '+section('donor'),
      '- Restore section: '+section('restore'));
    const code=['entry','startup','installed','alarm','message','UNKNOWN'];
    output.push('- Wake event: '+(code.includes(sr.wake?.lastEvent)?sr.wake.lastEvent:'UNKNOWN'));
    for(const [name,v] of [['Wake count',sr.wake?.count],['Alarm count',sr.wake?.alarmCount]])
      output.push('- '+name+': '+(Number.isSafeInteger(v)&&v>=0&&v<=999999?v:'UNAVAILABLE'));
  }else output.push('Independent diagnostics unavailable; inspect emergency diagnostics separately.');
  output.push('', 'H-01/H-07 need real human observation; H-06 is required only for migration.',
    'H-02–H-05 require separate authority when applicable. Unproven capabilities remain OFF.',
    '');
  return output.join('\n');
}
