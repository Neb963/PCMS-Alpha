// S05: Git-main owned Chat 1 instruction pin. Never accept a prompt or
// verdict from the UI/native AI response as deployment authority.
import {validPromptRevision} from './ai-evidence.mjs';
const fail=code=>({ok:false,code});
export function pinGitChatPrompt(catalog,settings,{repository,repositoryId}={}){
 if(catalog?.ok!==true||catalog.complete!==true||
    catalog.source!=='PINNED_MAIN_READ_ONLY'||catalog.repository!==repository||
    catalog.repositoryId!==repositoryId||
    !/^[a-f0-9]{40}$/.test(catalog.head||'')||
    catalog.prompt?.state!=='PRESENT'||
    !/^[a-f0-9]{40}$/.test(catalog.prompt.oid||'')||
    !settings||!Array.isArray(settings.tests))
   return fail('GIT_CHAT_PROMPT_NOT_PINNED');
 const prompt={revision:settings.revision,text:catalog.prompt.text,
   tests:settings.tests,source:'GIT_MAIN_CHAT1_PINNED',
   repositoryId,head:catalog.head,oid:catalog.prompt.oid};
 if(!validPromptRevision(prompt))return fail('GIT_CHAT_PROMPT_INVALID');
 return {ok:true,prompt};
}
