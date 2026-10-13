// I10 optional TESTING.md sealed-to-Core test declaration parser.
// A directive declares a test NAME, never a result or executable page code.
// Human prose stays a required unsupported check; it must not be silently
// discarded to make an optional test plan appear fully verified.
const NAMED=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
export function pinTestingAssertions(text){
  const held=code=>({ok:false,code});
  if(typeof text!=='string'||!text.trim()||text.length>16000)
    return held('TESTING_INPUT_UNVERIFIED');
  const lines=text.replace(/\r\n?/g,'\n').split('\n');
  const names=[],seen=new Set();let prose=false;
  for(const raw of lines){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const match=/^PCMS_TEST:\s*([A-Za-z0-9_.:-]+)\s*$/.exec(line);
    if(!match){prose=true;continue;}
    const name=match[1];
    if(!NAMED.test(name)||seen.has(name)||names.length>=63)
      return held('TESTING_DECLARATION_INVALID');
    seen.add(name);names.push(name);
  }
  // Legacy narrative TESTING.md has no trustworthy independent machine
  // assertions; preserve an explicit unsupported hold instead of fake PASS.
  if(prose||!names.length){
    if(!seen.has('optional_generator_tests'))names.push('optional_generator_tests');
  }
  return {ok:true,tests:names};
}
