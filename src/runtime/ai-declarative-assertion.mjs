// S05 bounded declarative test language. Source-controlled TESTING.md can
// request an observation, but cannot supply script, selector expressions,
// provider actions or a test result. Values are safe single DOM identifiers.
const kinds=new Set(['preview_element_visible','preview_button_enabled',
  'preview_input_editable','preview_select_usable']);
export function supportedDeclarativeAssertion(name){
 if(typeof name!=='string'||name.length>80)return false;
 const match=/^([A-Za-z_]+):([A-Za-z][A-Za-z0-9_-]{0,47})$/.exec(name);
 return !!match&&kinds.has(match[1]);
}
