// An operator submission is scoped creation intent, independent of Git setup.
// Only canonical sources from trusted intake count. Git-only discovery still
// requires the standing development grant. This grants no Git/source/publish.
export function createScopedCreationGate(authority){
 const gate=async({intent}={})=>{
  if((await authority?.allowsOperatorManagement())!==true)return false;
  if(intent?.sources?.some(s=>s.type==='OPERATOR'))return true;
  return authority?.gate('development')===true;
 };
 gate.generation=()=>authority?.policyGeneration();
 return gate;
}
